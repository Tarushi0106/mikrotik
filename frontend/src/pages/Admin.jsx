import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  FiServer,
  FiCheckCircle,
  FiXCircle,
  FiDatabase,
  FiArrowLeft,
  FiLogOut,
} from 'react-icons/fi';
import StatCard from '../components/ui/StatCard';
import DataTable from '../components/ui/DataTable';
import StatusPill from '../components/ui/StatusPill';
import DataNotice from '../components/ui/DataNotice';
import LiveUpdated from '../components/ui/LiveUpdated';
import { useResource } from '../hooks/useResource';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

const REFRESH_MS = 20000;

const demoOverview = {
  fleet: { totalDevices: 0, onlineCount: 0, offlineCount: 0, totalBytes: '0 B', devices: [] },
  active: null,
};

const RANGES = [
  { key: '10m', label: '10 min' },
  { key: '20m', label: '20 min' },
  { key: '1h', label: '1 hour' },
  { key: '6h', label: '6 hours' },
  { key: '24h', label: '24 hours' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
];

const deviceColumns = [
  { key: 'name', header: 'Name' },
  { key: 'host', header: 'IP Address' },
  {
    key: 'online',
    header: 'Status',
    render: (row) => <StatusPill status={row.online ? 'running' : 'stopped'} />,
  },
  { key: 'board', header: 'Model', render: (row) => row.board || <span className="text-ink-500/60">&mdash;</span> },
  { key: 'version', header: 'RouterOS', render: (row) => row.version || <span className="text-ink-500/60">&mdash;</span> },
  { key: 'uptime', header: 'Uptime', render: (row) => row.uptime || <span className="text-ink-500/60">&mdash;</span> },
  { key: 'totalBytes', header: 'Total Data', render: (row) => row.totalBytes || <span className="text-ink-500/60">&mdash;</span> },
  {
    key: 'active',
    header: 'Active',
    render: (row) => (row.active ? <StatusPill status="active" /> : <span className="text-ink-500/60">&mdash;</span>),
  },
];

const propertyColumns = [
  { key: 'label', header: 'Property' },
  { key: 'value', header: 'Value' },
];

const logColumns = [
  { key: 'time', header: 'Time' },
  { key: 'topic', header: 'Topic' },
  { key: 'message', header: 'Message' },
];

function TableSection({ title, children }) {
  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-wide text-ink-500 mb-2">{title}</h2>
      {children}
    </div>
  );
}

export default function Admin() {
  const { logout } = useAuth();
  const { data, error, loading, live, lastUpdated, refresh } = useResource('/admin/overview', {
    fallback: demoOverview,
    refreshMs: REFRESH_MS,
  });
  const overview = data ?? demoOverview;
  const fleet = overview.fleet ?? demoOverview.fleet;
  const active = overview.active && !overview.active.error ? overview.active : null;
  const activeError = overview.active?.error ?? null;
  const devices = fleet.devices ?? [];
  const selectedDevice = devices.find((d) => d.active);

  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState(null);

  // Independent of "Viewing" below: this only picks which device's traffic chart and
  // range to look at, and does not activate anything or affect the rest of the app.
  const [trafficDeviceIdOverride, setTrafficDeviceIdOverride] = useState(null);
  const [range, setRange] = useState('1h');
  const [customDate, setCustomDate] = useState('');
  const trafficDeviceId = trafficDeviceIdOverride ?? selectedDevice?.id ?? null;
  const trafficDevice = devices.find((d) => d.id === trafficDeviceId);
  const trafficLabel = customDate
    ? new Date(`${customDate}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : RANGES.find((r) => r.key === range)?.label;
  const trafficPath = trafficDeviceId
    ? `/traffic?deviceId=${encodeURIComponent(trafficDeviceId)}&${customDate ? `date=${customDate}` : `range=${range}`}`
    : `/traffic?${customDate ? `date=${customDate}` : `range=${range}`}`;
  const traffic = useResource(trafficPath, { fallback: { history: [] }, refreshMs: customDate ? 0 : REFRESH_MS });

  async function handleSelectDevice(id) {
    if (!id || id === selectedDevice?.id) return;
    setSwitching(true);
    setSwitchError(null);
    try {
      await api.post(`/devices/${encodeURIComponent(id)}/activate`);
      await refresh();
    } catch (err) {
      setSwitchError(err.message);
    } finally {
      setSwitching(false);
    }
  }

  const system = active?.system;
  const memPct = system ? Math.round((system.memoryUsedMB / system.memoryTotalMB) * 100) : 0;
  const diskPct = system ? Math.round((system.diskUsedMB / system.diskTotalMB) * 100) : 0;
  const runningInterfaces = active?.interfaces?.filter((i) => i.status === 'running').length ?? 0;

  const systemRows = system
    ? [
        { id: 'identity', label: 'Identity', value: system.identity },
        { id: 'model', label: 'Model', value: system.model },
        { id: 'serial', label: 'Serial Number', value: system.serialNumber ?? '—' },
        { id: 'routeros', label: 'RouterOS Version', value: system.routerOS },
        { id: 'uptime', label: 'Uptime', value: system.uptime },
        { id: 'cpu', label: 'CPU Load', value: `${system.cpuLoad}% (${system.cpuCount ?? 1}-core)` },
        { id: 'memory', label: 'Memory', value: `${memPct}% (${system.memoryUsedMB} / ${system.memoryTotalMB} MB)` },
        { id: 'disk', label: 'Disk', value: `${diskPct}% (${system.diskUsedMB} / ${system.diskTotalMB} MB)` },
        { id: 'temp', label: 'Temperature', value: system.temperatureC === null ? '—' : `${system.temperatureC}°C` },
      ]
    : [];

  const networkRows = active
    ? [
        { id: 'interfaces', label: 'Interfaces', value: `${runningInterfaces} / ${active.interfaces.length} running` },
        { id: 'wireless', label: 'Wireless Clients', value: active.wirelessClients.length },
        { id: 'dhcp', label: 'DHCP Leases', value: active.dhcpLeaseCount },
        { id: 'firewall', label: 'Firewall Rules', value: active.firewallRuleCount },
        { id: 'pppActive', label: 'PPP Active Connections', value: active.pppActiveCount },
        { id: 'pppSecrets', label: 'PPP Secrets', value: active.pppSecretCount },
        { id: 'wgIfaces', label: 'WireGuard Interfaces', value: active.wireguardInterfaceCount },
        { id: 'wgPeers', label: 'WireGuard Peers', value: active.wireguardPeerCount },
        { id: 'users', label: 'User Accounts', value: active.userCount },
      ]
    : [];

  return (
    <div className="min-h-screen bg-[#f7f5f6]">
      <header className="sticky top-0 z-10 bg-white border-b border-black/5 px-6 py-4 flex items-center justify-between shadow-sm shadow-black/[0.03]">
        <div className="flex items-center gap-3">
          <img src="/logo_black_shaurrya (2).jpg" alt="Shaurrya Teleservices" className="h-9 w-auto" />
          <div className="h-8 w-px bg-black/10" />
          <div>
            <h1 className="font-bold text-sm text-ink-900">Admin Panel</h1>
            <p className="text-xs text-ink-500">Fleet-wide status and full detail on the active device.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-700 hover:text-ink-900 bg-ink-900/5 hover:bg-ink-900/10 rounded-lg px-3 py-2 transition-colors"
          >
            <FiArrowLeft size={14} /> Back to Dashboard
          </Link>
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-3 py-2 transition-colors"
          >
            <FiLogOut size={14} /> Log out
          </button>
        </div>
      </header>

      <main className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <DataNotice error={error} live={live} loading={loading} onRetry={refresh} />
          {live && <LiveUpdated lastUpdated={lastUpdated} refreshMs={REFRESH_MS} />}
        </div>

        <TableSection title="Fleet Summary">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
            <StatCard icon={FiServer} label="Total Devices" value={fleet.totalDevices} sub="Added to this dashboard" />
            <StatCard icon={FiCheckCircle} label="Online" value={fleet.onlineCount} sub="Reachable right now" />
            <StatCard icon={FiXCircle} label="Offline" value={fleet.offlineCount} sub="Not reachable right now" />
            <StatCard icon={FiDatabase} label="Total Data" value={fleet.totalBytes} sub="Combined, since each device's last reboot" />
          </div>
          <DataTable columns={deviceColumns} rows={devices} />
        </TableSection>

        <div className="flex items-center flex-wrap justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-500">
            Active Device{system ? ` — ${system.identity}` : ''}
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-ink-700">Viewing:</span>
            <select
              value={selectedDevice?.id ?? ''}
              disabled={switching || devices.length === 0}
              onChange={(e) => handleSelectDevice(e.target.value)}
              className="text-sm border border-black/10 rounded-lg px-2.5 py-1.5 outline-none transition-shadow duration-150 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:opacity-60"
            >
              {devices.length === 0 && <option value="">No devices added</option>}
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.host}){d.online === false ? ' — offline' : ''}
                </option>
              ))}
            </select>
            {switching && <span className="text-xs text-ink-500">Switching…</span>}
          </div>
        </div>
        {switchError && (
          <p className="text-xs bg-brand-50 text-brand-700 rounded-lg px-3 py-2">{switchError}</p>
        )}
        {activeError && (
          <p className="text-xs bg-amber-50 text-amber-800 rounded-lg px-3 py-2">
            Could not load the active device's detail: {activeError}
          </p>
        )}

        {system && (
          <>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div>
                <h3 className="font-bold text-xs uppercase tracking-wide text-ink-500 mb-2">System Information</h3>
                <DataTable columns={propertyColumns} rows={systemRows} keyField="id" />
              </div>
              <div>
                <h3 className="font-bold text-xs uppercase tracking-wide text-ink-500 mb-2">Network Summary</h3>
                <DataTable columns={propertyColumns} rows={networkRows} keyField="id" />
              </div>
            </div>

            <div>
              <div className="bg-white rounded-lg border border-black/[0.04] shadow-sm shadow-black/[0.03] p-5">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <h3 className="font-bold text-sm text-ink-900">
                    Traffic ({trafficLabel}) &mdash; {trafficDevice ? `${trafficDevice.name} (${trafficDevice.host})` : 'select a device'}
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-ink-500">
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-brand-500" />Download</span>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-ink-700" />Upload</span>
                  </div>
                </div>

                <div className="flex items-center flex-wrap gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-ink-700">Device:</span>
                    <select
                      value={trafficDeviceId ?? ''}
                      disabled={devices.length === 0}
                      onChange={(e) => setTrafficDeviceIdOverride(e.target.value)}
                      className="text-sm border border-black/10 rounded-lg px-2.5 py-1.5 outline-none transition-shadow duration-150 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:opacity-60"
                    >
                      {devices.length === 0 && <option value="">No devices added</option>}
                      {devices.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.host}){d.online === false ? ' — offline' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center flex-wrap gap-1.5">
                    {RANGES.map((r) => (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => {
                          setRange(r.key);
                          setCustomDate('');
                        }}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                          !customDate && range === r.key
                            ? 'bg-brand-600 text-white'
                            : 'bg-ink-900/[0.04] text-ink-600 hover:bg-ink-900/[0.08]'
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                    <input
                      type="date"
                      value={customDate}
                      max={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setCustomDate(e.target.value)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium border outline-none transition-colors ${
                        customDate ? 'border-brand-600 text-brand-700' : 'border-black/10 text-ink-600'
                      }`}
                    />
                  </div>
                </div>

                {!traffic.live && traffic.error && (
                  <p className="mb-2 text-xs text-amber-700">{traffic.error.message}</p>
                )}

                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={traffic.data?.history ?? []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="adminRx" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#c8102e" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#c8102e" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="adminTx" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3f3f46" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#3f3f46" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#00000010" />
                      <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} unit=" Mb" />
                      <Tooltip contentStyle={{ borderRadius: 8, borderColor: '#00000015', fontSize: 12 }} formatter={(value) => [`${value} Mbps`]} />
                      <Area type="monotone" dataKey="rx" name="Download" stroke="#c8102e" fill="url(#adminRx)" strokeWidth={2} />
                      <Area type="monotone" dataKey="tx" name="Upload" stroke="#3f3f46" fill="url(#adminTx)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-bold text-xs uppercase tracking-wide text-ink-500 mb-2">Recent Logs</h3>
              <DataTable columns={logColumns} rows={active.recentLogs ?? []} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
