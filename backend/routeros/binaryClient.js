import routerosPkg from 'node-routeros';
import { RouterOsError, normalizeError } from './restClient.js';

// node-routeros is CommonJS; destructuring the default export is the safe interop form.
const { RouterOSAPI } = routerosPkg;

/**
 * RouterOS v6 (and v7) binary API client, port 8728 by default.
 *
 * Holds one connection and serialises commands through a promise chain, because the
 * binary protocol is a single request/response stream and concurrent writes interleave.
 */
export function createBinaryClient(options) {
  const { host, user, password, port = 8728, timeoutMs = 8000 } = options;

  let connection = null;
  let queue = Promise.resolve();

  async function ensureConnected() {
    if (connection?.connected) return connection;

    const conn = new RouterOSAPI({
      host,
      user,
      password,
      port,
      timeout: Math.ceil(timeoutMs / 1000),
      keepalive: true,
    });

    try {
      await conn.connect();
    } catch (err) {
      connection = null;
      throw translate(err, host);
    }

    connection = conn;
    return conn;
  }

  function run(command, params = []) {
    // Chain onto the queue so only one command is in flight at a time.
    const task = queue.then(async () => {
      const conn = await ensureConnected();
      try {
        return await conn.write(command, params);
      } catch (err) {
        // A dropped socket surfaces here; discard it so the next call reconnects.
        if (!conn.connected) connection = null;
        throw translate(err, host);
      }
    });

    queue = task.catch(() => {});
    return task;
  }

  return {
    kind: 'binary',
    async list(path) {
      const result = await run(`/${path.replace(/^\/+/, '')}/print`);
      return Array.isArray(result) ? result : [];
    },
    async get(path) {
      const result = await run(`/${path.replace(/^\/+/, '')}/print`);
      return Array.isArray(result) ? (result[0] ?? null) : (result ?? null);
    },
    async create(path, fields) {
      const result = await run(`/${path.replace(/^\/+/, '')}/add`, toParams(fields));
      return Array.isArray(result) ? (result[0]?.ret ?? null) : (result?.ret ?? null);
    },
    async update(path, id, fields) {
      await run(`/${path.replace(/^\/+/, '')}/set`, [`=.id=${id}`, ...toParams(fields)]);
    },
    async remove(path, id) {
      await run(`/${path.replace(/^\/+/, '')}/remove`, [`=.id=${id}`]);
    },
    async close() {
      if (connection?.connected) {
        try {
          await connection.close();
        } catch {
          // Nothing useful to do if the socket is already gone.
        }
      }
      connection = null;
    },
  };
}

/** Converts { name: 'value' } into RouterOS's "=name=value" word format, dropping empties. */
function toParams(fields = {}) {
  return Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `=${key}=${value}`);
}

function translate(err, host) {
  const message = err?.message ?? String(err);

  // node-routeros reports auth failures as a trap rather than a socket error.
  if (/cannot log in|invalid user name or password|not allowed/i.test(message)) {
    return new RouterOsError('Router rejected the credentials.', 'AUTH');
  }
  if (/no such command|unknown command|syntax error/i.test(message)) {
    return new RouterOsError(`Path not supported on this RouterOS version: ${message}`, 'NOT_FOUND');
  }
  return normalizeError(err, host);
}
