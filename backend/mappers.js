import {
  pick,
  toNum,
  isTrue,
  bytesToMB,
  formatBytes,
  formatRate,
  formatPacketRate,
  formatUptime,
  formatDurationShort,
  parseSignal,
  normalizeMac,
  cleanVersion,
} from './lib/format.js';

/** Falls back to the record index when RouterOS omits .id, so React keys stay stable. */
function idOf(record, index) {
  return pick(record, '.id', 'id') ?? `row-${index}`;
}

/**
 * /system/health differs by version: v6 returns one record of named fields, v7 returns
 * a list of {name, value} rows. This flattens both into a plain object.
 */
export function flattenHealth(records) {
  const out = {};
  if (!Array.isArray(records)) return out;

  for (const record of records) {
    const name = pick(record, 'name');
    const value = pick(record, 'value');
    if (name !== undefined && value !== undefined) {
      out[String(name)] = value;
      continue;
    }
    for (const [key, val] of Object.entries(record)) {
      if (!key.startsWith('.')) out[key] = val;
    }
  }
  return out;
}

export function mapSystemInfo({ resource, identity, routerboard, health }) {
  const totalMemory = toNum(pick(resource, 'total-memory'));
  const freeMemory = toNum(pick(resource, 'free-memory'));
  const totalDisk = toNum(pick(resource, 'total-hdd-space'));
  const freeDisk = toNum(pick(resource, 'free-hdd-space'));

  const temperature = pick(health, 'temperature', 'cpu-temperature', 'board-temperature');
  const voltage = pick(health, 'voltage');

  return {
    identity: pick(identity, 'name') ?? 'unknown',
    model: pick(routerboard, 'model') ?? pick(resource, 'board-name') ?? 'unknown',
    serialNumber: pick(routerboard, 'serial-number') ?? null,
    routerOS: cleanVersion(pick(resource, 'version')) ?? 'unknown',
    firmware: pick(routerboard, 'current-firmware') ?? null,
    architecture: pick(resource, 'architecture-name') ?? null,
    uptime: formatUptime(pick(resource, 'uptime')),
    cpuLoad: toNum(pick(resource, 'cpu-load')),
    cpuCount: toNum(pick(resource, 'cpu-count'), 1),
    cpuFrequencyMHz: toNum(pick(resource, 'cpu-frequency')) || null,
    memoryUsedMB: bytesToMB(totalMemory - freeMemory),
    memoryTotalMB: bytesToMB(totalMemory),
    diskUsedMB: bytesToMB(totalDisk - freeDisk),
    diskTotalMB: bytesToMB(totalDisk),
    // Small boards such as the hAP lite have no thermal or voltage sensors at all.
    temperatureC: temperature === undefined ? null : toNum(temperature),
    voltage: voltage === undefined ? null : toNum(voltage),
  };
}

function labelType(type) {
  if (!type) return 'Unknown';
  const key = String(type).toLowerCase();
  if (key.startsWith('ether')) return 'Ethernet';
  if (key.startsWith('bridge')) return 'Bridge';
  if (key.startsWith('wlan') || key.startsWith('wifi')) return 'Wireless';
  if (key.startsWith('vlan')) return 'VLAN';
  if (key.includes('ppp')) return 'PPP';
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export function mapInterfaces(records, rates = new Map()) {
  if (!Array.isArray(records)) return [];

  return records.map((record, index) => {
    const name = pick(record, 'name') ?? '—';
    const rate = rates.get(name);

    let status = 'stopped';
    if (isTrue(pick(record, 'disabled'))) status = 'disabled';
    else if (isTrue(pick(record, 'running'))) status = 'running';

    return {
      id: idOf(record, index),
      name,
      type: labelType(pick(record, 'type')),
      status,
      mac: normalizeMac(pick(record, 'mac-address')),
      rxRate: formatRate(rate?.rxBps ?? 0),
      txRate: formatRate(rate?.txBps ?? 0),
      rxRateBps: Math.round(rate?.rxBps ?? 0),
      txRateBps: Math.round(rate?.txBps ?? 0),
      rxPacketRate: formatPacketRate(rate?.rxPps ?? 0),
      txPacketRate: formatPacketRate(rate?.txPps ?? 0),
      rxPps: Math.round(rate?.rxPps ?? 0),
      txPps: Math.round(rate?.txPps ?? 0),
      rxBytes: formatBytes(pick(record, 'rx-byte')),
      txBytes: formatBytes(pick(record, 'tx-byte')),
      rxPackets: toNum(pick(record, 'rx-packet')),
      txPackets: toNum(pick(record, 'tx-packet')),
      rxDrops: toNum(pick(record, 'rx-drop')),
      txDrops: toNum(pick(record, 'tx-drop')),
      rxErrors: toNum(pick(record, 'rx-error')),
      txErrors: toNum(pick(record, 'tx-error')),
      txQueueDrops: toNum(pick(record, 'tx-queue-drop')),
      mtu: pick(record, 'actual-mtu', 'mtu') ?? '—',
      comment: pick(record, 'comment') ?? '',
    };
  });
}

/**
 * The wireless registration table has no IP or hostname, so leases are cross-referenced
 * by MAC to fill those columns in.
 */
export function mapWirelessClients(records, leaseRecords = []) {
  if (!Array.isArray(records)) return [];

  const byMac = new Map();
  for (const lease of leaseRecords) {
    const mac = normalizeMac(pick(lease, 'mac-address'));
    if (mac) byMac.set(mac, lease);
  }

  return records.map((record, index) => {
    const mac = normalizeMac(pick(record, 'mac-address'));
    const lease = byMac.get(mac);

    return {
      id: idOf(record, index),
      hostname: pick(lease, 'host-name') ?? pick(record, 'comment') ?? 'unknown',
      mac,
      ip: pick(lease, 'address') ?? '—',
      ssid: pick(record, 'ssid') ?? pick(record, 'interface') ?? '—',
      interface: pick(record, 'interface') ?? '—',
      signal: parseSignal(pick(record, 'signal-strength', 'signal')),
      txRate: pick(record, 'tx-rate') ?? '—',
      rxRate: pick(record, 'rx-rate') ?? '—',
      uptime: formatDurationShort(pick(record, 'uptime')),
    };
  });
}

export function mapDhcpLeases(records) {
  if (!Array.isArray(records)) return [];

  return records.map((record, index) => ({
    id: idOf(record, index),
    address: pick(record, 'address') ?? '—',
    mac: normalizeMac(pick(record, 'mac-address')),
    hostname: pick(record, 'host-name') ?? pick(record, 'comment') ?? 'unknown',
    status: pick(record, 'status') ?? 'unknown',
    server: pick(record, 'server') ?? '—',
    expiresIn: formatDurationShort(pick(record, 'expires-after')),
  }));
}

export function mapFirewallRules(records) {
  if (!Array.isArray(records)) return [];

  return records.map((record, index) => ({
    id: idOf(record, index),
    chain: pick(record, 'chain') ?? '—',
    action: pick(record, 'action') ?? '—',
    protocol: pick(record, 'protocol') ?? 'any',
    srcAddress: pick(record, 'src-address', 'src-address-list') ?? '0.0.0.0/0',
    dstPort: pick(record, 'dst-port') ?? 'any',
    comment: pick(record, 'comment') ?? '',
    bytes: formatBytes(pick(record, 'bytes')),
    packets: toNum(pick(record, 'packets')),
    disabled: isTrue(pick(record, 'disabled')),
  }));
}

export function mapIpAddresses(records) {
  if (!Array.isArray(records)) return [];

  return records.map((record, index) => ({
    id: idOf(record, index),
    address: pick(record, 'address') ?? '—',
    network: pick(record, 'network') ?? '—',
    interface: pick(record, 'interface') ?? '—',
    disabled: isTrue(pick(record, 'disabled')),
    comment: pick(record, 'comment') ?? '',
  }));
}

export function mapLogs(records) {
  if (!Array.isArray(records)) return [];

  // RouterOS returns the log oldest-first; the UI reads best newest-first.
  return records
    .map((record, index) => ({
      id: idOf(record, index),
      time: pick(record, 'time') ?? '—',
      topic: pick(record, 'topics') ?? '',
      message: pick(record, 'message') ?? '',
    }))
    .reverse();
}

export function mapPppActive(records) {
  if (!Array.isArray(records)) return [];

  return records.map((record, index) => ({
    id: idOf(record, index),
    name: pick(record, 'name') ?? '—',
    service: pick(record, 'service') ?? '—',
    callerId: pick(record, 'caller-id') ?? '—',
    address: pick(record, 'address') ?? '—',
    uptime: formatDurationShort(pick(record, 'uptime')),
  }));
}

export function mapPppSecrets(records) {
  if (!Array.isArray(records)) return [];

  return records.map((record, index) => ({
    id: idOf(record, index),
    name: pick(record, 'name') ?? '—',
    service: pick(record, 'service') ?? 'any',
    profile: pick(record, 'profile') ?? 'default',
    localAddress: pick(record, 'local-address') ?? '—',
    remoteAddress: pick(record, 'remote-address') ?? '—',
    comment: pick(record, 'comment') ?? '',
    disabled: isTrue(pick(record, 'disabled')),
  }));
}

export function mapWireguardInterfaces(records) {
  if (!Array.isArray(records)) return [];

  return records.map((record, index) => {
    let status = 'stopped';
    if (isTrue(pick(record, 'disabled'))) status = 'disabled';
    else if (isTrue(pick(record, 'running'))) status = 'running';

    return {
      id: idOf(record, index),
      name: pick(record, 'name') ?? '—',
      mtu: toNum(pick(record, 'mtu')),
      listenPort: pick(record, 'listen-port') ?? '—',
      publicKey: pick(record, 'public-key') ?? '—',
      status,
      comment: pick(record, 'comment') ?? '',
    };
  });
}

export function mapWireguardPeers(records) {
  if (!Array.isArray(records)) return [];

  return records.map((record, index) => ({
    id: idOf(record, index),
    interface: pick(record, 'interface') ?? '—',
    publicKey: pick(record, 'public-key') ?? '—',
    endpoint: pick(record, 'current-endpoint-address') || pick(record, 'endpoint-address') || '—',
    allowedAddress: pick(record, 'allowed-address') ?? '—',
    rx: formatBytes(pick(record, 'rx')),
    tx: formatBytes(pick(record, 'tx')),
    lastHandshake: pick(record, 'last-handshake') || '—',
    disabled: isTrue(pick(record, 'disabled')),
    comment: pick(record, 'comment') ?? '',
  }));
}

export function mapUsers(records) {
  if (!Array.isArray(records)) return [];

  return records.map((record, index) => ({
    id: idOf(record, index),
    username: pick(record, 'name') ?? '—',
    fullName: pick(record, 'comment') || '—',
    role: pick(record, 'group') ?? '—',
    lastLogin: pick(record, 'last-logged-in') ?? '—',
    status: isTrue(pick(record, 'disabled')) ? 'disabled' : 'active',
  }));
}
