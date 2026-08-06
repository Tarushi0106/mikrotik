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

    // node-routeros emits 'error' on the socket (dropped connection, remote reset, idle
    // timeout) even after connect() has already resolved. An EventEmitter 'error' with no
    // listener is fatal in Node — it throws and takes the whole backend process down. This
    // listener is what stops that: just drop the dead connection so the next call redials.
    conn.on('error', () => {
      if (connection === conn) connection = null;
    });

    try {
      await withTimeout(conn.connect(), timeoutMs, `connecting to ${host}`);
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
        return await withTimeout(conn.write(command, params), timeoutMs, `talking to ${host}`);
      } catch (err) {
        // A dropped socket, or a command that never got a reply, surfaces here; discard
        // the connection so the next call redials instead of waiting on the same stuck one.
        if (!conn.connected || err.code === 'TIMEOUT') connection = null;
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

/**
 * node-routeros's own internal timeout does not reliably fire for every stall (e.g. the
 * TCP handshake succeeds but RouterOS's login/reply sequence never completes). Without a
 * hard external timeout, a stuck connect()/write() hangs forever and blocks every other
 * request that shares this client via getClient() — this is what makes that impossible.
 */
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new RouterOsError(`Timed out after ${ms}ms ${label}.`, 'TIMEOUT'));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
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
