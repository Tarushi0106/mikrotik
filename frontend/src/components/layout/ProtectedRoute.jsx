import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { DeviceProvider } from '../../context/DeviceContext';

export default function ProtectedRoute() {
  const { user, initializing } = useAuth();

  // Redirecting before the session check finishes would bounce signed-in users to /login
  // on every page refresh.
  if (initializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-900/[0.02]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // Mounted inside the guard so the router is only polled for signed-in users.
  return (
    <DeviceProvider>
      <Outlet />
    </DeviceProvider>
  );
}
