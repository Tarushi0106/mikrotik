import { config } from '../config.js';
import { createRestClient, RouterOsError } from './restClient.js';
import { createBinaryClient } from './binaryClient.js';

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

/** Switches which saved device the whole app reads from. */
export async function activateDevice(device) {
  config.router.host = device.host;
  config.router.user = device.user;
  config.router.password = device.password;
  config.router.mode = device.apiMode || 'auto';
  await resetClient();
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
