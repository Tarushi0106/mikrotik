import { createContext, useContext } from 'react';
import { useResource } from '../hooks/useResource';

const DeviceContext = createContext(null);

/**
 * Shares router identity and resource stats across the chrome (topbar, settings) so
 * every consumer does not poll /api/system separately.
 */
export function DeviceProvider({ children }) {
  const { data, error, loading, live, refresh } = useResource('/system', {
    fallback: null,
    refreshMs: 15000,
  });

  return (
    <DeviceContext.Provider value={{ system: data, error, loading, live, refresh }}>
      {children}
    </DeviceContext.Provider>
  );
}

export function useDevice() {
  const ctx = useContext(DeviceContext);
  if (!ctx) throw new Error('useDevice must be used within DeviceProvider');
  return ctx;
}
