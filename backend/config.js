import 'dotenv/config';

function num(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1' || value === 'yes';
}

export const config = {
  router: {
    host: process.env.MIKROTIK_HOST ?? '192.168.88.1',
    user: process.env.MIKROTIK_USER ?? 'admin',
    password: process.env.MIKROTIK_PASSWORD ?? '',
    // 'auto' probes REST first then falls back to the binary API.
    mode: process.env.MIKROTIK_API ?? 'auto',
    restProtocol: process.env.MIKROTIK_REST_PROTOCOL ?? 'https',
    restPort: num(process.env.MIKROTIK_REST_PORT, undefined),
    binaryPort: num(process.env.MIKROTIK_BINARY_PORT, 8728),
    // RouterOS ships a self-signed certificate, so verification is off by default.
    rejectUnauthorized: bool(process.env.MIKROTIK_TLS_VERIFY, false),
    timeoutMs: num(process.env.MIKROTIK_TIMEOUT_MS, 8000),
  },
  server: {
    port: num(process.env.PORT, 4000),
    sessionTtlMs: num(process.env.SESSION_TTL_MINUTES, 480) * 60 * 1000,
  },
  dashboardAuth: {
    username: process.env.DASHBOARD_USER ?? 'admin',
    password: process.env.DASHBOARD_PASSWORD ?? 'admin',
  },
  traffic: {
    // Interface whose counters drive the dashboard chart. Blank = busiest running interface.
    interface: process.env.TRAFFIC_INTERFACE ?? '',
    intervalMs: num(process.env.TRAFFIC_INTERVAL_MS, 10000),
    historyPoints: num(process.env.TRAFFIC_HISTORY_POINTS, 60),
  },
};

export function describeTarget() {
  const { host, mode, restProtocol, restPort, binaryPort } = config.router;
  const rest = `${restProtocol}://${host}${restPort ? `:${restPort}` : ''}/rest`;
  return { host, mode, rest, binary: `${host}:${binaryPort}` };
}
