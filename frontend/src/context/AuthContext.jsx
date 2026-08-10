import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, onUnauthorized } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // The session lives in an httpOnly cookie, so we have to ask the backend who we are
  // before deciding whether to redirect to /login. Until then, render nothing decisive.
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let active = true;

    api
      .get('/auth/me')
      .then((result) => {
        if (active) setUser({ username: result.username });
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setInitializing(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    // Any 401 from a data endpoint means the session expired underneath us.
    onUnauthorized(() => setUser(null));
    return () => onUnauthorized(null);
  }, []);

  const login = useCallback(async (username, password) => {
    const result = await api.post('/auth/login', { username, password });
    setUser({ username: result.username });
    return result;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Clearing local state matters more than the round trip succeeding.
    }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, initializing, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
