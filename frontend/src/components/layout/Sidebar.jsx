import { NavLink } from 'react-router-dom';
import {
  FiHome,
  FiShare2,
  FiWifi,
  FiList,
  FiShield,
  FiGlobe,
  FiActivity,
  FiUsers,
  FiPhoneCall,
  FiKey,
  FiLink,
  FiServer,
  FiChevronsLeft,
  FiChevronsRight,
} from 'react-icons/fi';

const navItems = [
  { to: '/', label: 'Dashboard', icon: FiHome, end: true },
  { to: '/devices', label: 'Devices', icon: FiServer },
  { to: '/interfaces', label: 'Interfaces', icon: FiShare2 },
  { to: '/wireless', label: 'Wireless', icon: FiWifi },
  { to: '/dhcp', label: 'DHCP Leases', icon: FiList },
  { to: '/ppp', label: 'PPP', icon: FiPhoneCall },
  { to: '/wireguard', label: 'WireGuard', icon: FiKey },
  { to: '/tunnels', label: 'Tunnels', icon: FiLink },
  { to: '/firewall', label: 'Firewall', icon: FiShield },
  { to: '/ip-addresses', label: 'IP Addresses', icon: FiGlobe },
  { to: '/logs', label: 'System Logs', icon: FiActivity },
  { to: '/users', label: 'Users', icon: FiUsers },
];

export default function Sidebar({ open, onNavigate, collapsed, onToggleCollapse }) {
  return (
    <aside
      className={`fixed z-30 inset-y-0 left-0 w-64 bg-white text-ink-700 border-r border-black/5 flex flex-col transition-[transform,width] duration-200 ease-in-out lg:translate-x-0 lg:static ${
        open ? 'translate-x-0' : '-translate-x-full'
      } ${collapsed ? 'lg:w-20' : 'lg:w-64'}`}
    >
      <div className="flex items-center h-16 border-b border-black/5 overflow-hidden shrink-0 px-5">
        {collapsed ? (
          <div className="w-8 h-8 rounded-md bg-brand-50 text-brand-600 flex items-center justify-center font-semibold text-sm shrink-0">
            S
          </div>
        ) : (
          <img
            src="/logo_black_shaurrya (2).jpg"
            alt="Shaurrya Teleservices"
            className="h-9 w-auto"
          />
        )}
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-3 space-y-1">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
                collapsed ? 'lg:justify-center' : ''
              } ${
                isActive
                  ? 'bg-brand-50 text-brand-700 shadow-[inset_3px_0_0_0_var(--color-brand-600)]'
                  : 'text-ink-500 hover:bg-ink-900/5 hover:text-ink-900'
              }`
            }
          >
            <Icon size={17} className="shrink-0" />
            <span className={collapsed ? 'lg:hidden' : ''}>{label}</span>
          </NavLink>
        ))}
      </nav>

      <button
        onClick={onToggleCollapse}
        className="hidden lg:flex items-center gap-2 px-5 py-3 border-t border-black/5 text-ink-500 hover:text-ink-900 hover:bg-ink-900/5 transition-colors duration-150 text-xs font-medium"
      >
        {collapsed ? <FiChevronsRight size={15} /> : <FiChevronsLeft size={15} />}
        <span className={collapsed ? 'lg:hidden' : ''}>Collapse</span>
      </button>

      <div className={`px-5 py-3 border-t border-black/5 text-[11px] text-ink-500/70 ${collapsed ? 'lg:hidden' : ''}`}>
        NetControl v1.0 · Frontend preview
      </div>
    </aside>
  );
}
