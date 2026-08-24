import { config, describeTarget } from './config.js';
import {
  getClient,
  createClient,
  resetClient,
  testConnection,
  activateDevice,
  getDeviceSnapshot,
  provisionWireguardTunnel,
  teardownWireguardTunnel,
  provisionPppTunnel,
  teardownPppTunnel,
  pppTunnelActive,
} from './routeros/index.js';
import crypto from 'node:crypto';
import { requireAuth } from './auth.js';
import { getRates, queryHistory, getSamplerStatus } from './trafficSampler.js';
import { scanServices } from './lib/portScan.js';
import { formatBytes, formatUptime, pick } from './lib/format.js';
import {
  listDevices,
  addDevice,
  removeDevice,
  getDevice,
  getActiveDevice,
  setActiveDevice,
  listDevicesWithSecrets,
} from './lib/deviceStore.js';
import {
  listTunnels,
  getTunnel,
  addTunnel,
  removeTunnel,
  newTunnelId,
  nextTunnelSubnet,
  splitTunnelSubnet,
} from './lib/tunnelStore.js';

const TUNNEL_TYPES = ['wireguard', 'pptp', 'l2tp', 'sstp'];
import {
  flattenHealth,
  mapSystemInfo,
  mapInterfaces,
  mapWirelessClients,
  mapDhcpLeases,
  mapFirewallRules,
  mapIpAddresses,
  mapLogs,
  mapUsers,
  mapPppActive,
  mapPppSecrets,
  mapWireguardInterfaces,
  mapWireguardPeers,
} from './mappers.js';

const LOG_LIMIT = 300;

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.code = 'VALIDATION';
  }
}

function requireFields(body, fields) {
  const missing = fields.filter((f) => !body?.[f]);
  if (missing.length) throw new ValidationError(`Missing required field(s): ${missing.join(', ')}`);
}

/** Wraps an async handler so RouterOS failures become clean JSON instead of a stack trace. */
function handler(fn) {
  return async (req, res) => {
    try {
      res.json(await fn(req));
    } catch (err) {
      const code = err.code ?? 'UNKNOWN';
      // A broken pipe should not poison every later request.
      if (code === 'TIMEOUT' || code === 'REFUSED' || code === 'UNREACHABLE') {
        await resetClient().catch(() => {});
      }
      const status = code === 'VALIDATION' ? 400 : code === 'AUTH' ? 502 : 503;
      res.status(status).json({ error: err.message, code });
    }
  };
}

/**
 * Reads the first path the router actually supports. Menus move between RouterOS
 * versions and packages - wireless is /interface/wireless on v6 and the legacy v7
 * package, but /interface/wifi on v7 with wifi-qcom. Devices with no radio have neither.
 */
async function listFirstAvailable(client, paths) {
  for (const path of paths) {
    try {
      return await client.list(path);
    } catch (err) {
      if (err.code === 'NOT_FOUND') continue;
      throw err;
    }
  }
  return [];
}

async function getOrNull(client, path) {
  try {
    return await client.get(path);
  } catch (err) {
    if (err.code === 'NOT_FOUND') return null;
    throw err;
  }
}

const WIRELESS_PATHS = [
  'interface/wireless/registration-table',
  'interface/wifi/registration-table',
  'interface/wifiwave2/registration-table',
];

async function readSystemInfo(client) {
  // Fetched in parallel; health and routerboard are absent on some boards, hence getOrNull.
  const [resource, identity, routerboard, health] = await Promise.all([
    client.get('system/resource'),
    getOrNull(client, 'system/identity'),
    getOrNull(client, 'system/routerboard'),
    listFirstAvailable(client, ['system/health']).catch(() => []),
  ]);

  return mapSystemInfo({
    resource,
    identity,
    routerboard,
    health: flattenHealth(health),
  });
}

export function registerApiRoutes(app) {
  // Unauthenticated so the login screen can show whether the device is even reachable.
  app.get('/api/health', async (req, res) => {
    const target = describeTarget();
    try {
      const client = await getClient();
      const resource = await client.get('system/resource');
      res.json({
        backend: 'ok',
        router: 'ok',
        transport: client.kind,
        routerOS: resource ? String(resource.version ?? '') : null,
        board: resource ? String(resource['board-name'] ?? '') : null,
        target,
      });
    } catch (err) {
      res.status(503).json({
        backend: 'ok',
        router: 'unreachable',
        error: err.message,
        code: err.code ?? 'UNKNOWN',
        target,
      });
    }
  });

  app.get('/api/system', requireAuth, handler(async () => readSystemInfo(await getClient())));

  app.get(
    '/api/interfaces',
    requireAuth,
    handler(async () => {
      const client = await getClient();
      return mapInterfaces(await client.list('interface'), getRates());
    }),
  );

  app.get(
    '/api/wireless',
    requireAuth,
    handler(async () => {
      const client = await getClient();
      const [registrations, leases] = await Promise.all([
        listFirstAvailable(client, WIRELESS_PATHS),
        client.list('ip/dhcp-server/lease').catch(() => []),
      ]);
      return mapWirelessClients(registrations, leases);
    }),
  );

  app.get(
    '/api/dhcp',
    requireAuth,
    handler(async () => {
      const client = await getClient();
      return mapDhcpLeases(await client.list('ip/dhcp-server/lease'));
    }),
  );

  app.get(
    '/api/firewall',
    requireAuth,
    handler(async () => {
      const client = await getClient();
      return mapFirewallRules(await client.list('ip/firewall/filter'));
    }),
  );

  app.get(
    '/api/ip-addresses',
    requireAuth,
    handler(async () => {
      const client = await getClient();
      return mapIpAddresses(await client.list('ip/address'));
    }),
  );

  app.get(
    '/api/logs',
    requireAuth,
    handler(async () => {
      const client = await getClient();
      return mapLogs(await client.list('log')).slice(0, LOG_LIMIT);
    }),
  );

  app.get(
    '/api/users',
    requireAuth,
    handler(async () => {
      const client = await getClient();
      return mapUsers(await client.list('user'));
    }),
  );

  app.get(
    '/api/ppp/active',
    requireAuth,
    handler(async () => {
      const client = await getClient();
      return mapPppActive(await client.list('ppp/active'));
    }),
  );

  app.get(
    '/api/ppp/secrets',
    requireAuth,
    handler(async () => {
      const client = await getClient();
      return mapPppSecrets(await client.list('ppp/secret'));
    }),
  );

  app.post(
    '/api/ppp/secrets',
    requireAuth,
    handler(async (req) => {
      requireFields(req.body, ['name', 'password']);
      const client = await getClient();
      await client.create('ppp/secret', {
        name: req.body.name,
        password: req.body.password,
        service: req.body.service || 'any',
        profile: req.body.profile || 'default',
        'local-address': req.body.localAddress,
        'remote-address': req.body.remoteAddress,
        comment: req.body.comment,
      });
      return mapPppSecrets(await client.list('ppp/secret'));
    }),
  );

  app.patch(
    '/api/ppp/secrets/:id',
    requireAuth,
    handler(async (req) => {
      const client = await getClient();
      const fields = {};
      if (req.body.disabled !== undefined) fields.disabled = req.body.disabled ? 'yes' : 'no';
      if (req.body.comment !== undefined) fields.comment = req.body.comment;
      await client.update('ppp/secret', req.params.id, fields);
      return mapPppSecrets(await client.list('ppp/secret'));
    }),
  );

  app.delete(
    '/api/ppp/secrets/:id',
    requireAuth,
    handler(async (req) => {
      const client = await getClient();
      await client.remove('ppp/secret', req.params.id);
      return mapPppSecrets(await client.list('ppp/secret'));
    }),
  );

  app.get(
    '/api/wireguard/interfaces',
    requireAuth,
    handler(async () => {
      const client = await getClient();
      return mapWireguardInterfaces(await client.list('interface/wireguard'));
    }),
  );

  app.post(
    '/api/wireguard/interfaces',
    requireAuth,
    handler(async (req) => {
      requireFields(req.body, ['name']);
      const client = await getClient();
      await client.create('interface/wireguard', {
        name: req.body.name,
        'listen-port': req.body.listenPort,
        comment: req.body.comment,
      });
      return mapWireguardInterfaces(await client.list('interface/wireguard'));
    }),
  );

  app.delete(
    '/api/wireguard/interfaces/:id',
    requireAuth,
    handler(async (req) => {
      const client = await getClient();
      await client.remove('interface/wireguard', req.params.id);
      return mapWireguardInterfaces(await client.list('interface/wireguard'));
    }),
  );

  app.get(
    '/api/wireguard/peers',
    requireAuth,
    handler(async () => {
      const client = await getClient();
      return mapWireguardPeers(await client.list('interface/wireguard/peers'));
    }),
  );

  app.post(
    '/api/wireguard/peers',
    requireAuth,
    handler(async (req) => {
      requireFields(req.body, ['interface', 'publicKey', 'allowedAddress']);
      const client = await getClient();
      await client.create('interface/wireguard/peers', {
        interface: req.body.interface,
        'public-key': req.body.publicKey,
        'allowed-address': req.body.allowedAddress,
        'endpoint-address': req.body.endpointAddress,
        'endpoint-port': req.body.endpointPort,
        comment: req.body.comment,
      });
      return mapWireguardPeers(await client.list('interface/wireguard/peers'));
    }),
  );

  app.patch(
    '/api/wireguard/peers/:id',
    requireAuth,
    handler(async (req) => {
      const client = await getClient();
      const fields = {};
      if (req.body.disabled !== undefined) fields.disabled = req.body.disabled ? 'yes' : 'no';
      await client.update('interface/wireguard/peers', req.params.id, fields);
      return mapWireguardPeers(await client.list('interface/wireguard/peers'));
    }),
  );

  app.delete(
    '/api/wireguard/peers/:id',
    requireAuth,
    handler(async (req) => {
      const client = await getClient();
      await client.remove('interface/wireguard/peers', req.params.id);
      return mapWireguardPeers(await client.list('interface/wireguard/peers'));
    }),
  );

  // ── Tunnels: site-to-site links (WireGuard, PPTP, L2TP, SSTP) between two devices ────
  // WireGuard is symmetric (a peer on each side); the PPP-family protocols are
  // client/server, so for those deviceA is always the server and deviceB dials in.
  const TUNNEL_STATUS_TTL_MS = 15000;
  const tunnelStatusCache = new Map(); // id -> { statusA, statusB, updatedAt }

  async function peerHandshake(device, interfaceName) {
    let client = null;
    try {
      client = await createClient({ host: device.host, user: device.user, password: device.password, mode: device.apiMode });
      const peers = await client.list('interface/wireguard/peers');
      const peer = peers.find((p) => pick(p, 'interface') === interfaceName);
      return pick(peer, 'last-handshake') || null;
    } catch {
      return null;
    } finally {
      if (client) await client.close().catch(() => {});
    }
  }

  async function refreshTunnelStatus(tunnel) {
    // getDevice() (unlike listDevices()) includes the password — needed to connect.
    const deviceA = getDevice(tunnel.deviceA.id);
    const deviceB = getDevice(tunnel.deviceB.id);

    let statusA = null;
    let statusB = null;
    if (tunnel.type === 'wireguard') {
      [statusA, statusB] = await Promise.all([
        deviceA ? peerHandshake(deviceA, tunnel.interfaceName) : null,
        deviceB ? peerHandshake(deviceB, tunnel.interfaceName) : null,
      ]);
    } else {
      // PPP-family tunnels are one link, not two independent sides — a session on the
      // server (deviceA) means the whole tunnel is up, so both sides report it.
      const active = deviceA ? await pppTunnelActive(deviceA, tunnel.secretName) : null;
      statusA = active;
      statusB = active;
    }

    const entry = { statusA, statusB, updatedAt: Date.now() };
    tunnelStatusCache.set(tunnel.id, entry);
    return entry;
  }

  app.get(
    '/api/tunnels',
    requireAuth,
    handler(async () => {
      const tunnels = listTunnels();
      const devices = listDevices();
      const deviceById = new Map(devices.map((d) => [d.id, d]));

      return Promise.all(
        tunnels.map(async (t) => {
          const cached = tunnelStatusCache.get(t.id);
          if (!cached || Date.now() - cached.updatedAt >= TUNNEL_STATUS_TTL_MS) {
            refreshTunnelStatus(t).catch(() => {});
          }
          const status = cached ?? { statusA: null, statusB: null };
          const deviceA = deviceById.get(t.deviceA.id);
          const deviceB = deviceById.get(t.deviceB.id);
          return {
            id: t.id,
            name: t.name,
            type: t.type,
            subnet: t.subnet,
            interfaceName: t.interfaceName,
            createdAt: t.createdAt,
            deviceA: {
              id: t.deviceA.id,
              name: deviceA?.name ?? t.deviceA.name ?? 'Unknown device',
              host: deviceA?.host ?? t.deviceA.host,
              address: t.deviceA.address,
              listenPort: t.deviceA.listenPort,
              role: t.type === 'wireguard' ? null : 'server',
              status: status.statusA,
              missing: !deviceA,
            },
            deviceB: {
              id: t.deviceB.id,
              name: deviceB?.name ?? t.deviceB.name ?? 'Unknown device',
              host: deviceB?.host ?? t.deviceB.host,
              address: t.deviceB.address,
              listenPort: t.deviceB.listenPort,
              role: t.type === 'wireguard' ? null : 'client',
              status: status.statusB,
              missing: !deviceB,
            },
          };
        }),
      );
    }),
  );

  app.post(
    '/api/tunnels',
    requireAuth,
    handler(async (req) => {
      requireFields(req.body, ['deviceAId', 'deviceBId']);
      const { name, deviceAId, deviceBId } = req.body;
      const type = TUNNEL_TYPES.includes(req.body.type) ? req.body.type : 'wireguard';
      if (deviceAId === deviceBId) throw new ValidationError('Pick two different devices to tunnel between.');

      // getDevice() (unlike listDevices()) includes the password — needed to connect.
      const deviceA = getDevice(deviceAId);
      const deviceB = getDevice(deviceBId);
      if (!deviceA || !deviceB) throw new ValidationError('One of the selected devices no longer exists.');

      const id = newTunnelId();
      const interfaceName = `nc-${id.slice(0, 8)}`;
      const subnet = nextTunnelSubnet();
      const tunnelName = name || `${deviceA.name} ↔ ${deviceB.name}`;
      const comment = `NetControl tunnel: ${tunnelName}`;

      let record;
      if (type === 'wireguard') {
        const result = await provisionWireguardTunnel({ deviceA, deviceB, interfaceName, subnet, comment });
        record = addTunnel({
          id,
          name: tunnelName,
          type,
          subnet,
          interfaceName,
          deviceA: { id: deviceAId, name: deviceA.name, host: deviceA.host, address: result.addressA, listenPort: result.listenPortA },
          deviceB: { id: deviceBId, name: deviceB.name, host: deviceB.host, address: result.addressB, listenPort: result.listenPortB },
        });
      } else {
        const { addressA, addressB } = splitTunnelSubnet(subnet);
        const secretName = `nc-${id.slice(0, 8)}`;
        const secretPassword = crypto.randomBytes(9).toString('base64url');
        await provisionPppTunnel({ type, deviceA, deviceB, interfaceName, secretName, secretPassword, addressA, addressB, comment });
        record = addTunnel({
          id,
          name: tunnelName,
          type,
          subnet,
          interfaceName,
          secretName,
          deviceA: { id: deviceAId, name: deviceA.name, host: deviceA.host, address: addressA },
          deviceB: { id: deviceBId, name: deviceB.name, host: deviceB.host, address: addressB },
        });
      }

      return record;
    }),
  );

  app.delete(
    '/api/tunnels/:id',
    requireAuth,
    handler(async (req) => {
      const tunnel = getTunnel(req.params.id);
      if (!tunnel) throw new ValidationError('Unknown tunnel.');

      // getDevice() (unlike listDevices()) includes the password — needed to connect.
      const deviceA = getDevice(tunnel.deviceA.id);
      const deviceB = getDevice(tunnel.deviceB.id);

      if (tunnel.type === 'wireguard') {
        await Promise.all([
          deviceA ? teardownWireguardTunnel({ device: deviceA, interfaceName: tunnel.interfaceName }).catch(() => {}) : null,
          deviceB ? teardownWireguardTunnel({ device: deviceB, interfaceName: tunnel.interfaceName }).catch(() => {}) : null,
        ]);
      } else {
        await teardownPppTunnel({
          type: tunnel.type,
          deviceA,
          deviceB,
          interfaceName: tunnel.interfaceName,
          secretName: tunnel.secretName,
        }).catch(() => {});
      }

      tunnelStatusCache.delete(tunnel.id);
      removeTunnel(tunnel.id);
      return { removed: tunnel.id };
    }),
  );

  app.get('/api/traffic', requireAuth, (req, res) => {
    const { range, date, deviceId } = req.query;
    res.json({ history: queryHistory({ range, date, deviceId }), ...getSamplerStatus() });
  });

  // One round trip for the dashboard instead of four.
  app.get(
    '/api/overview',
    requireAuth,
    handler(async () => {
      const client = await getClient();
      const [system, interfaceRecords, registrations, leases] = await Promise.all([
        readSystemInfo(client),
        client.list('interface'),
        listFirstAvailable(client, WIRELESS_PATHS),
        client.list('ip/dhcp-server/lease').catch(() => []),
      ]);

      return {
        system,
        interfaces: mapInterfaces(interfaceRecords, getRates()),
        wirelessClients: mapWirelessClients(registrations, leases),
        traffic: { history: queryHistory({ range: '24h' }), ...getSamplerStatus() },
      };
    }),
  );

  app.get('/api/config', requireAuth, (req, res) => {
    res.json({
      host: config.router.host,
      mode: config.router.mode,
      traffic: getSamplerStatus(),
    });
  });

  // ── Devices: manage which MikroTik router(s) this dashboard can talk to ──────────────
  app.post(
    '/api/connection/probe',
    requireAuth,
    handler(async (req) => {
      const host = String(req.body?.host ?? '').trim();
      if (!host) throw new ValidationError('Enter a router IP address.');
      const services = await scanServices(host);
      return { host, services };
    }),
  );

  // Reachability/port-scan checks are real network round trips (can take seconds on a
  // closed port or a slow WAN link), so they're cached per device and refreshed in the
  // background rather than blocking every page load / poll on a fresh check.
  const DEVICE_STATUS_TTL_MS = 15000;
  const deviceStatusCache = new Map(); // id -> { online, offlineReason, services, updatedAt }
  const deviceStatusInFlight = new Map(); // id -> Promise

  function refreshDeviceStatus(device) {
    const existing = deviceStatusInFlight.get(device.id);
    if (existing) return existing;

    const promise = (async () => {
      const [services, snapshot] = await Promise.all([
        scanServices(device.host).catch(() => []),
        getDeviceSnapshot(device),
      ]);
      const isOpen = (key) => services.find((s) => s.key === key)?.open ?? false;
      const entry = {
        online: snapshot.online,
        offlineReason: snapshot.online ? null : snapshot.error,
        services: {
          rest: isOpen('rest') || isOpen('rest-ssl'),
          binary: isOpen('binary') || isOpen('binary-ssl'),
          winbox: isOpen('winbox'),
          ssh: isOpen('ssh'),
        },
        updatedAt: Date.now(),
      };
      deviceStatusCache.set(device.id, entry);
      return entry;
    })().finally(() => deviceStatusInFlight.delete(device.id));

    deviceStatusInFlight.set(device.id, promise);
    return promise;
  }

  app.get(
    '/api/devices',
    requireAuth,
    handler(async () => {
      const devices = listDevicesWithSecrets();
      const activeId = getActiveDevice()?.id;
      return Promise.all(
        devices.map(async (d) => {
          const { password: _pw, ...safe } = d;
          const cached = deviceStatusCache.get(d.id);
          if (!cached) {
            // Nothing cached yet (first request since the server started) — wait once.
            await refreshDeviceStatus(d).catch(() => {});
          } else if (Date.now() - cached.updatedAt >= DEVICE_STATUS_TTL_MS) {
            // Serve the stale value now; let the next request pick up the fresh one.
            refreshDeviceStatus(d).catch(() => {});
          }
          const status = deviceStatusCache.get(d.id) ?? {
            online: false,
            offlineReason: null,
            services: { rest: false, binary: false, winbox: false, ssh: false },
          };
          return { ...safe, active: d.id === activeId, ...status, updatedAt: undefined };
        }),
      );
    }),
  );

  app.post(
    '/api/devices',
    requireAuth,
    handler(async (req) => {
      requireFields(req.body, ['host', 'user', 'password']);
      const { name, host, user, password, apiMode } = req.body;
      // Fails loudly (AUTH/UNREACHABLE) before ever saving a device that cannot connect.
      const result = await testConnection({ host, user, password, mode: apiMode || 'auto' });
      const device = addDevice({ name, host, user, password, apiMode: result.mode });
      const { password: _pw, ...safe } = device;
      return safe;
    }),
  );

  app.post(
    '/api/devices/:id/activate',
    requireAuth,
    handler(async (req) => {
      const device = getDevice(req.params.id);
      if (!device) throw new ValidationError('Unknown device.');
      setActiveDevice(device.id);
      await activateDevice(device);
      return { activated: device.id };
    }),
  );

  app.delete(
    '/api/devices/:id',
    requireAuth,
    handler(async (req) => {
      const wasActive = getActiveDevice()?.id === req.params.id;
      removeDevice(req.params.id);
      deviceStatusCache.delete(req.params.id);
      const nextActive = getActiveDevice();
      if (wasActive) {
        if (nextActive) await activateDevice(nextActive);
        else await resetClient();
      }
      return { removed: req.params.id };
    }),
  );

  // ── Admin overview: fleet-wide status across every added device ──────────────────────
  // One round trip for the whole admin panel: fleet-wide status for every device, plus
  // a full deep-dive on whichever device is currently active.
  app.get(
    '/api/admin/overview',
    requireAuth,
    handler(async () => {
      const devices = listDevicesWithSecrets();
      const activeId = getActiveDevice()?.id;

      const [fleetResults, activePanel] = await Promise.all([
        Promise.all(
          devices.map(async (d) => {
            const snapshot = await getDeviceSnapshot(d);
            const rxBytes = snapshot.online ? snapshot.totalRxBytes : 0;
            const txBytes = snapshot.online ? snapshot.totalTxBytes : 0;
            return {
              id: d.id,
              name: d.name,
              host: d.host,
              active: d.id === activeId,
              online: snapshot.online,
              error: snapshot.online ? null : snapshot.error,
              version: snapshot.version,
              board: snapshot.board,
              uptime: snapshot.online ? formatUptime(snapshot.uptime) : null,
              interfaceCount: snapshot.online ? snapshot.interfaceCount : null,
              totalBytes: snapshot.online ? formatBytes(rxBytes + txBytes) : null,
              rxBytes,
              txBytes,
            };
          }),
        ),
        (async () => {
          const client = await getClient();
          const [
            system,
            interfaceRecords,
            registrations,
            leases,
            firewallRules,
            pppActive,
            pppSecrets,
            wgInterfaces,
            wgPeers,
            logRecords,
            userRecords,
          ] = await Promise.all([
            readSystemInfo(client),
            client.list('interface'),
            listFirstAvailable(client, WIRELESS_PATHS),
            client.list('ip/dhcp-server/lease').catch(() => []),
            client.list('ip/firewall/filter').catch(() => []),
            client.list('ppp/active').catch(() => []),
            client.list('ppp/secret').catch(() => []),
            client.list('interface/wireguard').catch(() => []),
            client.list('interface/wireguard/peers').catch(() => []),
            client.list('log').catch(() => []),
            client.list('user').catch(() => []),
          ]);

          return {
            system,
            interfaces: mapInterfaces(interfaceRecords, getRates()),
            wirelessClients: mapWirelessClients(registrations, leases),
            traffic: { history: queryHistory({ range: '1h' }), ...getSamplerStatus() },
            dhcpLeaseCount: leases.length,
            firewallRuleCount: firewallRules.length,
            pppActiveCount: pppActive.length,
            pppSecretCount: pppSecrets.length,
            wireguardInterfaceCount: wgInterfaces.length,
            wireguardPeerCount: wgPeers.length,
            userCount: userRecords.length,
            recentLogs: mapLogs(logRecords).slice(0, 8),
          };
        })().catch((err) => ({ error: err.message })),
      ]);

      const onlineCount = fleetResults.filter((d) => d.online).length;
      const totalBytes = fleetResults.reduce((sum, d) => sum + d.rxBytes + d.txBytes, 0);

      return {
        fleet: {
          totalDevices: devices.length,
          onlineCount,
          offlineCount: devices.length - onlineCount,
          totalBytes: formatBytes(totalBytes),
          devices: fleetResults,
        },
        active: activePanel,
      };
    }),
  );
}
