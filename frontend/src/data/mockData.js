// Static mock data standing in for a MikroTik RouterOS API until the backend is built.

export const systemInfo = {
  identity: 'ST-CORE-RTR01',
  model: 'RB4011iGS+',
  routerOS: '7.15.3',
  uptime: '46d 08:12:47',
  cpuLoad: 18,
  memoryUsedMB: 412,
  memoryTotalMB: 1024,
  diskUsedMB: 128,
  diskTotalMB: 512,
  temperatureC: 41,
  voltage: 24.1,
};

export const trafficHistory = [
  { time: '00:00', rx: 42, tx: 18 },
  { time: '02:00', rx: 35, tx: 15 },
  { time: '04:00', rx: 28, tx: 11 },
  { time: '06:00', rx: 51, tx: 22 },
  { time: '08:00', rx: 88, tx: 46 },
  { time: '10:00', rx: 120, tx: 64 },
  { time: '12:00', rx: 134, tx: 71 },
  { time: '14:00', rx: 142, tx: 76 },
  { time: '16:00', rx: 128, tx: 68 },
  { time: '18:00', rx: 98, tx: 52 },
  { time: '20:00', rx: 76, tx: 39 },
  { time: '22:00', rx: 58, tx: 27 },
];

export const interfaces = [
  { id: 1, name: 'ether1-wan', type: 'Ethernet', status: 'running', mac: 'D4:CA:6D:12:34:01', rxRate: '84.2 Mbps', txRate: '41.6 Mbps', comment: 'Uplink to ISP' },
  { id: 2, name: 'ether2-lan', type: 'Ethernet', status: 'running', mac: 'D4:CA:6D:12:34:02', rxRate: '12.4 Mbps', txRate: '38.9 Mbps', comment: 'Office LAN' },
  { id: 3, name: 'ether3-servers', type: 'Ethernet', status: 'running', mac: 'D4:CA:6D:12:34:03', rxRate: '210.5 Mbps', txRate: '198.2 Mbps', comment: 'Server rack' },
  { id: 4, name: 'ether4', type: 'Ethernet', status: 'disabled', mac: 'D4:CA:6D:12:34:04', rxRate: '0 bps', txRate: '0 bps', comment: '' },
  { id: 5, name: 'wlan1-2.4G', type: 'Wireless', status: 'running', mac: 'D4:CA:6D:12:34:05', rxRate: '6.1 Mbps', txRate: '9.8 Mbps', comment: 'Staff Wi-Fi 2.4G' },
  { id: 6, name: 'wlan2-5G', type: 'Wireless', status: 'running', mac: 'D4:CA:6D:12:34:06', rxRate: '44.3 Mbps', txRate: '61.7 Mbps', comment: 'Staff Wi-Fi 5G' },
  { id: 7, name: 'bridge-local', type: 'Bridge', status: 'running', mac: 'D4:CA:6D:12:34:07', rxRate: '96.7 Mbps', txRate: '88.1 Mbps', comment: 'LAN bridge' },
];

export const wirelessClients = [
  { id: 1, hostname: 'DESKTOP-J3KD91', mac: '3C:A9:F4:11:AA:01', ip: '192.168.10.24', ssid: 'ShaurryaTele-Staff', signal: -52, txRate: '234 Mbps', rxRate: '210 Mbps', uptime: '5h 12m' },
  { id: 2, hostname: 'iPhone-Priya', mac: '9C:35:EB:22:BB:02', ip: '192.168.10.31', ssid: 'ShaurryaTele-Staff', signal: -61, txRate: '144 Mbps', rxRate: '130 Mbps', uptime: '2h 03m' },
  { id: 3, hostname: 'HP-Printer-2F', mac: '70:5A:0F:33:CC:03', ip: '192.168.10.40', ssid: 'ShaurryaTele-IoT', signal: -70, txRate: '54 Mbps', rxRate: '48 Mbps', uptime: '1d 04h' },
  { id: 4, hostname: 'MacBook-Rohit', mac: 'A4:83:E7:44:DD:04', ip: '192.168.10.27', ssid: 'ShaurryaTele-Staff', signal: -48, txRate: '390 Mbps', rxRate: '360 Mbps', uptime: '18m' },
  { id: 5, hostname: 'CCTV-Lobby', mac: '00:1A:79:55:EE:05', ip: '192.168.10.60', ssid: 'ShaurryaTele-IoT', signal: -75, txRate: '24 Mbps', rxRate: '18 Mbps', uptime: '9d 22h' },
];

export const dhcpLeases = [
  { id: 1, address: '192.168.10.24', mac: '3C:A9:F4:11:AA:01', hostname: 'DESKTOP-J3KD91', status: 'bound', expiresIn: '9h 12m' },
  { id: 2, address: '192.168.10.31', mac: '9C:35:EB:22:BB:02', hostname: 'iPhone-Priya', status: 'bound', expiresIn: '11h 40m' },
  { id: 3, address: '192.168.10.40', mac: '70:5A:0F:33:CC:03', hostname: 'HP-Printer-2F', status: 'bound', expiresIn: '23h 02m' },
  { id: 4, address: '192.168.10.27', mac: 'A4:83:E7:44:DD:04', hostname: 'MacBook-Rohit', status: 'bound', expiresIn: '6h 55m' },
  { id: 5, address: '192.168.10.60', mac: '00:1A:79:55:EE:05', hostname: 'CCTV-Lobby', status: 'bound', expiresIn: '3h 18m' },
  { id: 6, address: '192.168.10.90', mac: 'F8:32:E4:66:FF:06', hostname: 'unknown', status: 'waiting', expiresIn: '—' },
];

export const firewallRules = [
  { id: 1, chain: 'input', action: 'accept', protocol: 'tcp', srcAddress: '0.0.0.0/0', dstPort: '22', comment: 'Allow SSH mgmt', bytes: '1.2 MB', disabled: false },
  { id: 2, chain: 'input', action: 'drop', protocol: 'tcp', srcAddress: '0.0.0.0/0', dstPort: '23', comment: 'Block telnet', bytes: '0 B', disabled: false },
  { id: 3, chain: 'forward', action: 'accept', protocol: 'any', srcAddress: '192.168.10.0/24', dstPort: 'any', comment: 'LAN to WAN', bytes: '842.6 MB', disabled: false },
  { id: 4, chain: 'forward', action: 'drop', protocol: 'any', srcAddress: '192.168.20.0/24', dstPort: 'any', comment: 'Isolate IoT VLAN', bytes: '4.1 MB', disabled: false },
  { id: 5, chain: 'input', action: 'accept', protocol: 'icmp', srcAddress: '0.0.0.0/0', dstPort: 'any', comment: 'Allow ping', bytes: '96 KB', disabled: true },
];

export const ipAddresses = [
  { id: 1, address: '203.0.113.45/29', network: '203.0.113.40', interface: 'ether1-wan', comment: 'Static WAN IP' },
  { id: 2, address: '192.168.10.1/24', network: '192.168.10.0', interface: 'bridge-local', comment: 'Staff LAN gateway' },
  { id: 3, address: '192.168.20.1/24', network: '192.168.20.0', interface: 'bridge-local', comment: 'IoT VLAN gateway' },
  { id: 4, address: '10.10.0.1/30', network: '10.10.0.0', interface: 'ether3-servers', comment: 'Server rack link' },
];

export const systemLogs = [
  { id: 1, time: '2026-07-17 09:14:02', topic: 'system,info', message: 'Router rebooted after scheduled update' },
  { id: 2, time: '2026-07-17 08:52:41', topic: 'firewall,info', message: 'Rule #4 matched 128 times in last hour' },
  { id: 3, time: '2026-07-17 08:10:19', topic: 'wireless,info', message: 'MacBook-Rohit connected to wlan2-5G' },
  { id: 4, time: '2026-07-17 07:44:55', topic: 'dhcp,warning', message: 'Address pool ShaurryaTele-IoT 80% utilized' },
  { id: 5, time: '2026-07-16 23:59:00', topic: 'system,info', message: 'Daily configuration backup completed' },
  { id: 6, time: '2026-07-16 21:03:12', topic: 'account,info', message: 'User "admin" logged in from 203.0.113.10 via winbox' },
];

export const pppActive = [
  { id: 1, name: 'contractor-vpn', service: 'l2tp', callerId: '203.0.113.90', address: '10.20.0.5', uptime: '2h 14m' },
  { id: 2, name: 'branch-office', service: 'pptp', callerId: '198.51.100.12', address: '10.20.0.6', uptime: '1d 03h' },
];

export const pppSecrets = [
  { id: 1, name: 'contractor-vpn', service: 'l2tp', profile: 'default-encryption', localAddress: '10.20.0.1', remoteAddress: '10.20.0.5', comment: 'External NOC access', disabled: false },
  { id: 2, name: 'branch-office', service: 'pptp', profile: 'default', localAddress: '10.20.0.1', remoteAddress: '10.20.0.6', comment: 'Site-to-site link', disabled: false },
  { id: 3, name: 'old-vendor', service: 'any', profile: 'default', localAddress: '10.20.0.1', remoteAddress: '10.20.0.9', comment: 'Disabled after contract ended', disabled: true },
];

export const wireguardInterfaces = [
  { id: 1, name: 'wg-staff', mtu: 1420, listenPort: '13231', publicKey: 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1w=', status: 'running', comment: 'Staff remote access' },
];

export const wireguardPeers = [
  { id: 1, interface: 'wg-staff', publicKey: 'Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J3i2H1g0F9e=', endpoint: '203.0.113.77:13231', allowedAddress: '10.30.0.2/32', rx: '128.4 MB', tx: '96.1 MB', lastHandshake: '42s', disabled: false, comment: 'Rohit laptop' },
  { id: 2, interface: 'wg-staff', publicKey: 'Q5r6S7t8U9w0A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p=', endpoint: '198.51.100.44:13231', allowedAddress: '10.30.0.3/32', rx: '4.2 MB', tx: '2.8 MB', lastHandshake: '3h 12m', disabled: false, comment: 'Priya phone' },
];

export const users = [
  { id: 1, username: 'admin', fullName: 'Tarushi Chaudhary', role: 'full', lastLogin: '2026-07-17 09:02', status: 'active' },
  { id: 2, username: 'rohit.k', fullName: 'Rohit Kulkarni', role: 'write', lastLogin: '2026-07-16 18:41', status: 'active' },
  { id: 3, username: 'priya.s', fullName: 'Priya Sharma', role: 'read', lastLogin: '2026-07-15 11:20', status: 'active' },
  { id: 4, username: 'contractor', fullName: 'External NOC', role: 'read', lastLogin: '2026-06-02 14:05', status: 'disabled' },
];
