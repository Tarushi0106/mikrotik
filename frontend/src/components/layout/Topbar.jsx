import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiMenu, FiLogOut, FiWifi, FiChevronDown, FiSettings } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import { useDevice } from '../../context/DeviceContext';

export default function Topbar({ onMenuClick }) {
  const { user, logout } = useAuth();
  const { system, live } = useDevice();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = user?.username?.slice(0, 2).toUpperCase() || 'ST';
  const username = user?.username || 'admin';

  return (
    <header className="h-16 shrink-0 bg-white border-b border-black/5 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-20">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 -ml-2 rounded-md text-ink-700 hover:bg-ink-900/5 transition-colors duration-150"
          aria-label="Open menu"
        >
          <FiMenu size={20} />
        </button>
        <div className="flex items-center gap-2 text-sm text-ink-500">
          {live ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Online
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Demo data
            </span>
          )}
          <span className="hidden sm:inline">{system.identity}</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden md:flex items-center gap-2 text-xs text-ink-500">
          <FiWifi className="text-brand-600" />
          RouterOS {system.routerOS}
        </div>
        <div className="h-8 w-px bg-black/10 hidden md:block" />

        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className={`flex items-center gap-2 pl-1 pr-2 py-1 rounded-full transition-colors duration-150 ${
              menuOpen ? 'bg-ink-900/5' : 'hover:bg-ink-900/5'
            }`}
          >
            <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 ring-1 ring-brand-200 flex items-center justify-center text-xs font-semibold shrink-0">
              {initials}
            </div>
            <span className="hidden sm:block text-sm font-medium text-ink-900">{username}</span>
            <FiChevronDown
              size={14}
              className={`hidden sm:block text-ink-500 transition-transform duration-150 ${menuOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg border border-black/[0.06] shadow-lg shadow-black/10 py-1.5 z-40 animate-page">
                <div className="px-3.5 py-2.5 border-b border-black/[0.06]">
                  <p className="text-sm font-semibold text-ink-900 truncate">{username}</p>
                  <p className="text-xs text-ink-500 truncate">{system.identity}</p>
                </div>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    navigate('/settings');
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-ink-700 hover:bg-ink-900/5 hover:text-ink-900 transition-colors duration-150"
                >
                  <FiSettings size={15} /> Account settings
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-brand-600 hover:bg-brand-50 transition-colors duration-150"
                >
                  <FiLogOut size={15} /> Log out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
