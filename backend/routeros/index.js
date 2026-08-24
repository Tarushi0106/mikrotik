import { config } from '../config.js';
import { createRestClient, RouterOsError } from './restClient.js';
import { createBinaryClient } from './binaryClient.js';
import { pick } from '../lib/format.js';
import { splitTunnelSubnet } from '../lib/tunnelStore.js';

function buildRest(overrides = {}) {
  const r = config.router;
  return createRestClient({
    host: overrides.host ?? r.host,
    user: overrides.user ?? r.user,
    password: overrides.password ?? r.password,
    protocol: r.restProtocol,
    port: r.restPort,
    rejectUnauthorized: r.rejectUnauthorized,
    timeoutMs: r.timeoutMs,
  });
}

function buildBinary(overrides = {}) {
  const r = config.router;
  return createBinaryClient({
    host: overrides.host ?? r.host,
    user: overrides.user ?? r.user,
    password: overrides.password ?? r.password,
    port: r.binaryPort,
    timeoutMs: r.timeoutMs,
  });
}

/**
 * Resolves which transport this router actually speaks and returns a connected client.
 *
 * RouterOS v7 exposes /rest; v6 only has the binary API. In 'auto' mode we try REST
 * first because it is stateless and cheaper, then fall back.
 */
export async function createClient(overrides = {}) {
  const mode = overrides.mode ?? config.router.mode;

  if (mode === 'rest') {
    const client = buildRest(overrides);
    await client.get('system/resource');
    return client;
  }

  if (mode === 'binary') {
    const client = buildBinary(overrides);
    await client.get('system/resource');
    return client;
  }

  const attempts = [];

  const rest = buildRest(overrides);
  try {
    await rest.get('system/resource');
    return rest;
  } catch (err) {
    attempts.push(`REST: ${err.message}`);
    await rest.close();
    // Bad credentials will fail identically on the binary API, so stop here.
    if (err.code === 'AUTH') throw err;
  }

  const binary = buildBinary(overrides);
  try {
    await binary.get('system/resource');
    return binary;
  } catch (err) {
    attempts.push(`Binary API: ${err.message}`);
    await binary.close();
    throw new RouterOsError(
      `Could not reach RouterOS on ${overrides.host ?? config.router.host}.\n  ${attempts.join('\n  ')}`,
      err.code === 'AUTH' ? 'AUTH' : 'UNREACHABLE',
    );
  }
}

/**
 * Lazily-created shared client for the service account in .env, reused across requests.
 * Rebuilt on the next call if a request tears the connection down.
 */
let shared = null;
let pending = null;

export async function getClient() {
  if (shared) return shared;
  if (!pending) {
    pending = createClient()
      .then((client) => {
        shared = client;
        pending = null;
        return client;
      })
      .catch((err) => {
        pending = null;
        throw err;
      });
  }
  return pending;
}

export async function resetClient() {
  if (shared) await shared.close();
  shared = null;
}

/**
 * Repoints the app at a different router at runtime. This only changes the running
 * process's in-memory config; it reverts to the .env values on the next restart unless
 * something else (see activateDevice below) re-applies it on startup.
 */
export async function setConnectionTarget({ host, mode } = {}) {
  if (host) config.router.host = String(host).trim();
  if (mode) config.router.mode = String(mode).trim();
  await resetClient();
}

/**
 * Tries connecting with a full set of credentials without touching the shared/active
 * client — used to validate a device's details before it gets saved to the device list.
 * Returns which transport actually worked so it can be stored (skips auto-detect next time).
 */
export async function testConnection({ host, user, password, mode = 'auto' }) {
  const client = await createClient({ host, user, password, mode });
  try {
    const resource = await client.get('system/resource');
    return { ok: true, mode: client.kind, resource };
  } finally {
    await client.close();
  }
}

/**
 * Connects to one device just long enough to read a snapshot for the admin overview:
 * reachability, RouterOS version/board, uptime, and total bytes moved across all its
 * interfaces (a cumulative total since last reboot, not a live rate — getting a live rate
 * would need two samples spaced apart for every device, which is too slow for an overview
 * covering many devices at once).
 */
export async function getDeviceSnapshot({ host, user, password, apiMode }) {
  let client = null;
  try {
    client = await createClient({ host, user, password, mode: apiMode });
    const [resource, interfaces] = await Promise.all([
      client.get('system/resource'),
      client.list('interface'),
    ]);

    let totalRxBytes = 0;
    let totalTxBytes = 0;
    for (const iface of interfaces) {
      totalRxBytes += Number(iface?.['rx-byte'] ?? 0) || 0;
      totalTxBytes += Number(iface?.['tx-byte'] ?? 0) || 0;
    }

    return {
      online: true,
      version: resource?.version ?? null,
      board: resource?.['board-name'] ?? null,
      uptime: resource?.uptime ?? null,
      interfaceCount: interfaces.length,
      totalRxBytes,
      totalTxBytes,
    };
  } catch (err) {
    return { online: false, error: err.message };
  } finally {
    if (client) await client.close();
  }
}

/** Switches which saved device the whole app reads from. */
export async function activateDevice(device) {
  config.router.host = device.host;
  config.router.user = device.user;
  config.router.password = device.password;
  config.router.mode = device.apiMode || 'auto';
  await resetClient();
}

/** Reads a record back out of a list by its RouterOS id (`.id` on binary, `id` on REST). */
function findById(records, id) {
  return records.find((r) => pick(r, '.id', 'id') === id) ?? null;
}

/** First port from 51900 up that no existing WireGuard interface on this device is using. */
function pickFreeListenPort(existingInterfaces) {
  const used = new Set(existingInterfaces.map((r) => Number(pick(r, 'listen-port'))).filter(Boolean));
  let port = 51900;
  while (used.has(port)) port++;
  return port;
}

/**
 * Provisions a WireGuard site-to-site tunnel between two devices: creates a matching
 * interface on each side (auto-picking a free listen port per device), reads back
 * RouterOS's auto-generated public key, assigns each side an address on the tunnel
 * subnet, then cross-configures a peer on each side pointing at the other. If any step
 * fails, whatever was already created is torn down again so a half-built tunnel never
 * lingers on either router.
 */
export async function provisionWireguardTunnel({ deviceA, deviceB, interfaceName, subnet, comment }) {
  const { addressA, addressB } = splitTunnelSubnet(subnet);
  let clientA = null;
  let clientB = null;
  const created = { ifaceIdA: null, ifaceIdB: null, addrIdA: null, addrIdB: null, peerIdA: null, peerIdB: null };

  async function rollback() {
    if (created.peerIdA && clientA) await clientA.remove('interface/wireguard/peers', created.peerIdA).catch(() => {});
    if (created.peerIdB && clientB) await clientB.remove('interface/wireguard/peers', created.peerIdB).catch(() => {});
    if (created.addrIdA && clientA) await clientA.remove('ip/address', created.addrIdA).catch(() => {});
    if (created.addrIdB && clientB) await clientB.remove('ip/address', created.addrIdB).catch(() => {});
    if (created.ifaceIdA && clientA) await clientA.remove('interface/wireguard', created.ifaceIdA).catch(() => {});
    if (created.ifaceIdB && clientB) await clientB.remove('interface/wireguard', created.ifaceIdB).catch(() => {});
  }

  try {
    clientA = await createClient({ host: deviceA.host, user: deviceA.user, password: deviceA.password, mode: deviceA.apiMode });
    clientB = await createClient({ host: deviceB.host, user: deviceB.user, password: deviceB.password, mode: deviceB.apiMode });

    const [existingA, existingB] = await Promise.all([
      clientA.list('interface/wireguard'),
      clientB.list('interface/wireguard'),
    ]);
    const listenPortA = pickFreeListenPort(existingA);
    const listenPortB = pickFreeListenPort(existingB);

    created.ifaceIdA = await clientA.create('interface/wireguard', {
      name: interfaceName,
      'listen-port': listenPortA,
      comment,
    });
    created.ifaceIdB = await clientB.create('interface/wireguard', {
      name: interfaceName,
      'listen-port': listenPortB,
      comment,
    });

    const [recordsA, recordsB] = await Promise.all([
      clientA.list('interface/wireguard'),
      clientB.list('interface/wireguard'),
    ]);
    const publicKeyA = pick(findById(recordsA, created.ifaceIdA), 'public-key');
    const publicKeyB = pick(findById(recordsB, created.ifaceIdB), 'public-key');
    if (!publicKeyA || !publicKeyB) {
      throw new RouterOsError('The router did not return a public key for the new WireGuard interface.', 'UNKNOWN');
    }

    created.addrIdA = await clientA.create('ip/address', { address: addressA, interface: interfaceName, comment });
    created.addrIdB = await clientB.create('ip/address', { address: addressB, interface: interfaceName, comment });

    const hostA = addressA.split('/')[0];
    const hostB = addressB.split('/')[0];

    created.peerIdA = await clientA.create('interface/wireguard/peers', {
      interface: interfaceName,
      'public-key': publicKeyB,
      'endpoint-address': deviceB.host,
      'endpoint-port': listenPortB,
      'allowed-address': `${hostB}/32`,
      comment,
    });
    created.peerIdB = await clientB.create('interface/wireguard/peers', {
      interface: interfaceName,
      'public-key': publicKeyA,
      'endpoint-address': deviceA.host,
      'endpoint-port': listenPortA,
      'allowed-address': `${hostA}/32`,
      comment,
    });

    return { publicKeyA, publicKeyB, listenPortA, listenPortB, addressA, addressB };
  } catch (err) {
    await rollback();
    throw err;
  } finally {
    if (clientA) await clientA.close().catch(() => {});
    if (clientB) await clientB.close().catch(() => {});
  }
}

/**
 * Tears down both sides of a previously provisioned tunnel by interface name — looked up
 * fresh rather than by stored id, since a device may have restarted since the tunnel was
 * created. Best-effort: a side that is already gone or unreachable is skipped, not fatal.
 */
export async function teardownWireguardTunnel({ device, interfaceName }) {
  let client = null;
  try {
    client = await createClient({ host: device.host, user: device.user, password: device.password, mode: device.apiMode });
    const [ifaces, peers] = await Promise.all([
      client.list('interface/wireguard'),
      client.list('interface/wireguard/peers'),
    ]);
    const iface = ifaces.find((r) => pick(r, 'name') === interfaceName);
    for (const peer of peers) {
      if (pick(peer, 'interface') === interfaceName) {
        await client.remove('interface/wireguard/peers', pick(peer, '.id', 'id')).catch(() => {});
      }
    }
    if (iface) {
      await client.remove('interface/wireguard', pick(iface, '.id', 'id')).catch(() => {});
    }
  } finally {
    if (client) await client.close().catch(() => {});
  }
}

const PPP_TUNNEL_PATHS = {
  pptp: { server: 'interface/pptp-server/server', client: 'interface/pptp-client' },
  l2tp: { server: 'interface/l2tp-server/server', client: 'interface/l2tp-client' },
  sstp: { server: 'interface/sstp-server/server', client: 'interface/sstp-client' },
};

/**
 * Provisions a PPTP/L2TP/SSTP tunnel. Unlike WireGuard, these are client/server, not
 * symmetric peers: deviceA becomes the server (its server service is switched on if it
 * isn't already, and a PPP secret is created to authenticate the client) and deviceB
 * dials in as the client. The server-enable step is never reverted on failure or teardown
 * — other secrets on that device may already depend on it staying on — only the secret
 * and client interface this call creates are rolled back.
 */
export async function provisionPppTunnel({ type, deviceA, deviceB, interfaceName, secretName, secretPassword, addressA, addressB, comment }) {
  const paths = PPP_TUNNEL_PATHS[type];
  if (!paths) throw new RouterOsError(`Unsupported tunnel type: ${type}`, 'VALIDATION');

  let clientA = null;
  let clientB = null;
  const created = { secretId: null, clientIfaceId: null };

  async function rollback() {
    if (created.clientIfaceId && clientB) await clientB.remove(paths.client, created.clientIfaceId).catch(() => {});
    if (created.secretId && clientA) await clientA.remove('ppp/secret', created.secretId).catch(() => {});
  }

  try {
    clientA = await createClient({ host: deviceA.host, user: deviceA.user, password: deviceA.password, mode: deviceA.apiMode });
    clientB = await createClient({ host: deviceB.host, user: deviceB.user, password: deviceB.password, mode: deviceB.apiMode });

    // Idempotent: safe to call even if the server service is already enabled.
    await clientA.set(paths.server, { enabled: 'yes' });

    created.secretId = await clientA.create('ppp/secret', {
      name: secretName,
      password: secretPassword,
      service: type,
      'local-address': addressA,
      'remote-address': addressB,
      comment,
    });

    created.clientIfaceId = await clientB.create(paths.client, {
      name: interfaceName,
      'connect-to': deviceA.host,
      user: secretName,
      password: secretPassword,
      // Without this, RouterOS may replace deviceB's default route with one through the
      // tunnel — the client keeps its own internet routing untouched by this link.
      'add-default-route': 'no',
      ...(type === 'sstp' ? { 'verify-server-certificate': 'no' } : {}),
      comment,
    });

    return {};
  } catch (err) {
    await rollback();
    throw err;
  } finally {
    if (clientA) await clientA.close().catch(() => {});
    if (clientB) await clientB.close().catch(() => {});
  }
}

/**
 * Tears down a PPTP/L2TP/SSTP tunnel: removes the PPP secret from deviceA and the client
 * interface from deviceB, both looked up fresh by name. Either side may be null (its
 * device was removed from the registry) — that side is just skipped, not fatal. The
 * server service itself is left enabled, matching provisionPppTunnel's reasoning above.
 */
export async function teardownPppTunnel({ type, deviceA, deviceB, interfaceName, secretName }) {
  const paths = PPP_TUNNEL_PATHS[type];

  async function removeSecret() {
    if (!deviceA) return;
    let client = null;
    try {
      client = await createClient({ host: deviceA.host, user: deviceA.user, password: deviceA.password, mode: deviceA.apiMode });
      const secrets = await client.list('ppp/secret');
      const secret = secrets.find((r) => pick(r, 'name') === secretName);
      if (secret) await client.remove('ppp/secret', pick(secret, '.id', 'id'));
    } finally {
      if (client) await client.close().catch(() => {});
    }
  }

  async function removeClientInterface() {
    if (!deviceB) return;
    let client = null;
    try {
      client = await createClient({ host: deviceB.host, user: deviceB.user, password: deviceB.password, mode: deviceB.apiMode });
      const ifaces = await client.list(paths.client);
      const iface = ifaces.find((r) => pick(r, 'name') === interfaceName);
      if (iface) await client.remove(paths.client, pick(iface, '.id', 'id'));
    } finally {
      if (client) await client.close().catch(() => {});
    }
  }

  await Promise.all([removeSecret().catch(() => {}), removeClientInterface().catch(() => {})]);
}

/** Whether a PPP-based tunnel's secret currently has an active session on the server. */
export async function pppTunnelActive(deviceA, secretName) {
  let client = null;
  try {
    client = await createClient({ host: deviceA.host, user: deviceA.user, password: deviceA.password, mode: deviceA.apiMode });
    const active = await client.list('ppp/active');
    const session = active.find((r) => pick(r, 'name') === secretName);
    return session ? (pick(session, 'uptime') || true) : null;
  } catch {
    return null;
  } finally {
    if (client) await client.close().catch(() => {});
  }
}

/** Validates a username/password pair against the router itself. */
export async function verifyCredentials(user, password) {
  let client = null;
  try {
    client = await createClient({ user, password });
    return true;
  } catch (err) {
    if (err.code === 'AUTH') return false;
    throw err;
  } finally {
    if (client) await client.close();
  }
}

export { RouterOsError };
