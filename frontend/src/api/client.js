const BASE = `/api`;
export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  /** True when the backend is up but the router itself could not be reached. */
  get isRouterOffline() {
    return this.status === 503 || this.code === 'UNREACHABLE' || this.code === 'REFUSED';
  }

  /** True when the backend process is not running at all. */
  get isBackendOffline() {
    return this.status === 0;
  }
}

// AuthContext registers here so an expired session can drop the user to /login from
// anywhere, without every hook needing to know about auth.
let unauthorizedHandler = null;

export function onUnauthorized(handler) {
  unauthorizedHandler = handler;
}

async function parseBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 200) };
  }
}

async function request(method, path, body) {
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(
      'Cannot reach the backend. Start it with "npm run server".',
      0,
      'BACKEND_OFFLINE',
    );
  }

  const payload = await parseBody(response);

  if (response.status === 401) {
    // /api/auth/me is a deliberate probe on startup, so it must not trigger a logout loop.
    if (path !== '/auth/me') unauthorizedHandler?.();
    throw new ApiError(payload?.error ?? 'Not signed in.', 401, 'UNAUTHORIZED');
  }

  if (!response.ok) {
    throw new ApiError(
      payload?.error ?? `Request failed with status ${response.status}.`,
      response.status,
      payload?.code,
    );
  }

  return payload;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),
};
