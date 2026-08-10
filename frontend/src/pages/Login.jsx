import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { FiLock, FiUser, FiWifi } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [health, setHealth] = useState(null);

  // Surfaced before the user types anything, so a dead device is obvious immediately
  // rather than looking like a rejected password.
  useEffect(() => {
    let active = true;
    api
      .get('/health')
      .then((result) => active && setHealth(result))
      .catch((err) => active && setHealth({ router: 'unreachable', error: err.message }));
    return () => {
      active = false;
    };
  }, []);

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Enter both your admin ID and password to continue.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await login(username.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f7f5f6] px-4">
      <div className="w-full max-w-md animate-page">
        <div className="flex flex-col items-center mb-6">
          <img
            src="/shaurrya_logo_dark (1).svg"
            alt="Shaurrya Teleservices"
            className="h-10 w-auto mb-3"
          />
          <p className="text-sm text-ink-500">Network Control Center</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl border-t-4 border-brand-600 border-x border-b border-black/[0.06] shadow-xl shadow-black/[0.06] p-7 space-y-4"
        >
          <div className="flex items-center gap-2 text-ink-900 mb-1">
            <FiWifi className="text-brand-600" size={20} />
            <h2 className="font-semibold text-base">Sign in</h2>
          </div>
          <p className="text-xs text-ink-500 -mt-2">
            Use your NetControl admin ID and password.
          </p>

          {health && health.router !== 'ok' && (
            <div className="rounded-lg px-3 py-2 text-xs bg-amber-50 text-amber-800">
              <span className="font-semibold">Router not reachable.</span> {health.error}
            </div>
          )}

          {error && (
            <p className="text-xs bg-brand-50 text-brand-700 rounded-lg px-3 py-2">{error}</p>
          )}

          <label className="block">
            <span className="text-xs font-medium text-ink-700">Admin ID</span>
            <div className="mt-1 flex items-center gap-2 border border-black/10 rounded-lg px-3 py-2.5 transition-shadow duration-150 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
              <FiUser className="text-ink-500" size={16} />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                autoComplete="username"
                className="w-full outline-none text-sm text-ink-900 placeholder:text-ink-500/60"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-ink-700">Password</span>
            <div className="mt-1 flex items-center gap-2 border border-black/10 rounded-lg px-3 py-2.5 transition-shadow duration-150 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
              <FiLock className="text-ink-500" size={16} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                autoComplete="current-password"
                className="w-full outline-none text-sm text-ink-900 placeholder:text-ink-500/60"
              />
            </div>
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-brand-600 hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 text-white font-medium text-sm rounded-lg py-2.5 transition-all duration-150"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-ink-500/70 text-xs mt-5">
          &copy; {new Date().getFullYear()} Shaurrya Teleservices. All rights reserved.
        </p>
      </div>
    </div>
  );
}
