import net from 'node:net';

/**
 * Services a MikroTik router might expose. 'rest' and 'binary' are the two this app can
 * actually speak; winbox/ssh are shown for diagnostic context only (e.g. "the device
 * responds at all, but neither data API is enabled yet").
 */
export const SERVICE_PORTS = [
  { port: 80, key: 'rest', label: 'REST API (HTTP)' },
  { port: 443, key: 'rest-ssl', label: 'REST API (HTTPS)' },
  { port: 8728, key: 'binary', label: 'Binary API' },
  { port: 8729, key: 'binary-ssl', label: 'Binary API (TLS)' },
  { port: 8291, key: 'winbox', label: 'WinBox' },
  { port: 22, key: 'ssh', label: 'SSH' },
];

function checkPort(host, port, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const done = (open) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(open);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

/** Scans the standard MikroTik management ports on `host` and reports which answer. */
export async function scanServices(host) {
  const open = await Promise.all(SERVICE_PORTS.map((p) => checkPort(host, p.port)));
  return SERVICE_PORTS.map((p, i) => ({ ...p, open: open[i] }));
}
