import https from 'node:https';
import http from 'node:http';

/**
 * RouterOS v7 REST API client.
 *
 * Implemented on node:https rather than fetch because RouterOS ships a self-signed
 * certificate and the https module lets us set rejectUnauthorized per request without
 * touching NODE_TLS_REJECT_UNAUTHORIZED globally.
 */
export function createRestClient(options) {
  const {
    host,
    user,
    password,
    protocol = 'https',
    port,
    rejectUnauthorized = false,
    timeoutMs = 8000,
  } = options;

  const secure = protocol === 'https';
  const transport = secure ? https : http;
  const auth = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

  function request(method, path, body) {
    return new Promise((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : null;
      const req = transport.request(
        {
          host,
          port: port ?? (secure ? 443 : 80),
          method,
          path: `/rest/${path.replace(/^\/+/, '')}`,
          headers: {
            Authorization: auth,
            Accept: 'application/json',
            ...(payload
              ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
              : {}),
          },
          ...(secure ? { rejectUnauthorized } : {}),
        },
        (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');

            if (res.statusCode === 401) {
              reject(new RouterOsError('Router rejected the credentials (401).', 'AUTH'));
              return;
            }
            if (res.statusCode === 404) {
              reject(new RouterOsError(`Path not found on router: ${path}`, 'NOT_FOUND'));
              return;
            }
            if (res.statusCode >= 400) {
              reject(
                new RouterOsError(
                  `Router returned HTTP ${res.statusCode}: ${text.slice(0, 200)}`,
                  'HTTP',
                ),
              );
              return;
            }

            if (!text) {
              resolve(null);
              return;
            }
            try {
              resolve(JSON.parse(text));
            } catch {
              reject(new RouterOsError('Router returned a non-JSON response.', 'PARSE'));
            }
          });
        },
      );

      req.setTimeout(timeoutMs, () => {
        req.destroy(new RouterOsError(`Timed out after ${timeoutMs}ms talking to ${host}.`, 'TIMEOUT'));
      });
      req.on('error', (err) => reject(normalizeError(err, host)));
      if (payload) req.write(payload);
      req.end();
    });
  }

  return {
    kind: 'rest',
    async list(path) {
      const result = await request('GET', path);
      if (Array.isArray(result)) return result;
      return result ? [result] : [];
    },
    async get(path) {
      const result = await request('GET', path);
      return Array.isArray(result) ? (result[0] ?? null) : result;
    },
    async create(path, fields) {
      const result = await request('PUT', path, fields);
      return pickId(result);
    },
    async update(path, id, fields) {
      await request('PATCH', `${path.replace(/^\/+/, '')}/${id}`, fields);
    },
    /** For singleton "settings" menus (e.g. a *-server enable switch) that have no .id. */
    async set(path, fields) {
      await request('PATCH', path, fields);
    },
    async remove(path, id) {
      await request('DELETE', `${path.replace(/^\/+/, '')}/${id}`);
    },
    async close() {},
  };
}

function pickId(result) {
  const record = Array.isArray(result) ? result[0] : result;
  return record?.['.id'] ?? record?.id ?? null;
}

export class RouterOsError extends Error {
  constructor(message, code = 'UNKNOWN') {
    super(message);
    this.name = 'RouterOsError';
    this.code = code;
  }
}

export function normalizeError(err, host) {
  if (err instanceof RouterOsError) return err;
  const code = err?.code;
  if (code === 'ECONNREFUSED') {
    return new RouterOsError(
      `Connection refused by ${host}. The API service is probably disabled in IP -> Services.`,
      'REFUSED',
    );
  }
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') {
    return new RouterOsError(`No network route to ${host}.`, 'UNREACHABLE');
  }
  if (code === 'ETIMEDOUT' || code === 'ECONNRESET') {
    return new RouterOsError(`Timed out reaching ${host}. Check cabling and firewall rules.`, 'TIMEOUT');
  }
  if (code === 'ENOTFOUND') {
    return new RouterOsError(`Hostname ${host} could not be resolved.`, 'DNS');
  }
  return new RouterOsError(err?.message ?? String(err), code ?? 'UNKNOWN');
}
