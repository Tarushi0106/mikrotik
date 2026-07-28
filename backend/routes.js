import { config, describeTarget } from './config.js';
import { getClient, resetClient, testConnection, activateDevice } from './routeros/index.js';
import { requireAuth } from './auth.js';
import { getRates, queryHistory, getSamplerStatus } from './trafficSampler.js';
import { scanServices } from './lib/portScan.js';
import { listDevices, addDevice, removeDevice, getDevice, getActiveDevice, setActiveDevice } from './lib/deviceStore.js';
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

  app.get('/api/traffic', requireAuth, (req, res) => {
    const { range, date } = req.query;
    res.json({ history: queryHistory({ range, date }), ...getSamplerStatus() });
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

  app.get(
    '/api/devices',
    requireAuth,
    handler(async () => {
      const devices = listDevices();
      return Promise.all(
        devices.map(async (d) => {
          const services = await scanServices(d.host).catch(() => []);
          const isOpen = (key) => services.find((s) => s.key === key)?.open ?? false;
          return {
            ...d,
            services: {
              rest: isOpen('rest') || isOpen('rest-ssl'),
              binary: isOpen('binary') || isOpen('binary-ssl'),
              winbox: isOpen('winbox'),
              ssh: isOpen('ssh'),
            },
          };
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
      const nextActive = getActiveDevice();
      if (wasActive) {
        if (nextActive) await activateDevice(nextActive);
        else await resetClient();
      }
      return { removed: req.params.id };
    }),
  );
}
