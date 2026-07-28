import { useEffect, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { FiCpu, FiHardDrive, FiThermometer, FiClock, FiShare2, FiWifi } from 'react-icons/fi';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import StatusPill from '../components/ui/StatusPill';
import DataNotice from '../components/ui/DataNotice';
import { useResource } from '../hooks/useResource';
import { systemInfo, trafficHistory, interfaces, wirelessClients } from '../data/mockData';

const demoOverview = {
  system: systemInfo,
  interfaces,
  wirelessClients,
  traffic: { history: trafficHistory },
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

export default function Dashboard() {
  const { data, error, loading, live, refresh } = useResource('/overview', {
    fallback: demoOverview,
    refreshMs: 10000,
  });
  const overview = data ?? demoOverview;
  const { system } = overview;
  const overviewInterfaces = overview.interfaces ?? [];
  const overviewWirelessClients = overview.wirelessClients ?? [];
  const memPct = Math.round((system.memoryUsedMB / system.memoryTotalMB) * 100);
  const diskPct = Math.round((system.diskUsedMB / system.diskTotalMB) * 100);

  const [range, setRange] = useState('24h');
  const [customDate, setCustomDate] = useState('');
  const trafficPath = customDate ? `/traffic?date=${customDate}` : `/traffic?range=${range}`;
  const traffic = useResource(trafficPath, {
    fallback: demoOverview.traffic,
    refreshMs: customDate ? 0 : 10000,
  });
  const trafficLabel = customDate
    ? new Date(`${customDate}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : RANGES.find((r) => r.key === range)?.label;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`${system.identity} · ${system.model} · RouterOS ${system.routerOS}`}
      />
      <DataNotice error={error} live={live} loading={loading} onRetry={refresh} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard icon={FiCpu} label="CPU Load" value={`${system.cpuLoad}%`} sub={`${system.cpuCount ?? 1}-core`} />
        <StatCard icon={FiHardDrive} label="Memory" value={`${memPct}%`} sub={`${system.memoryUsedMB} / ${system.memoryTotalMB} MB`} />
        <StatCard icon={FiThermometer} label="Temperature" value={system.temperatureC === null ? '—' : `${system.temperatureC}°C`} sub={system.voltage === null ? 'No sensor' : `${system.voltage}V input`} />
        <StatCard icon={FiClock} label="Uptime" value={system.uptime} sub="Since last reboot" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
        <div className="xl:col-span-2 bg-white rounded-lg border border-black/[0.04] shadow-sm shadow-black/[0.03] p-5">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <h3 className="font-bold text-sm text-ink-900">Traffic ({trafficLabel})</h3>
            <div className="flex items-center gap-3 text-xs text-ink-500">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-brand-500" />Download</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-ink-700" />Upload</span>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-1.5 mb-4">
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

          {!traffic.live && traffic.error && (
            <p className="mb-3 text-xs text-amber-700">Showing demo traffic &mdash; {traffic.error.message}</p>
          )}

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={traffic.data?.history ?? []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="rx" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#c8102e" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#c8102e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="tx" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3f3f46" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3f3f46" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#00000010" />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} unit=" Mb" />
                <Tooltip
                  contentStyle={{ borderRadius: 8, borderColor: '#00000015', fontSize: 12 }}
                  formatter={(value) => [`${value} Mbps`]}
                />
                <Area type="monotone" dataKey="rx" name="Download" stroke="#c8102e" fill="url(#rx)" strokeWidth={2} />
                <Area type="monotone" dataKey="tx" name="Upload" stroke="#3f3f46" fill="url(#tx)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-black/[0.04] shadow-sm shadow-black/[0.03] p-5">
          <h3 className="font-bold text-sm text-ink-900 mb-3">Resource usage</h3>
          <div className="space-y-4">
            <UsageBar label="CPU" percent={system.cpuLoad} />
            <UsageBar label="Memory" percent={memPct} />
            <UsageBar label="Disk" percent={diskPct} />
          </div>
          <div className="mt-5 pt-4 border-t border-black/[0.06] text-xs text-ink-500 space-y-1.5">
            <div className="flex justify-between"><span>Board</span><span className="text-ink-900 font-medium">{system.model}</span></div>
            <div className="flex justify-between"><span>Voltage</span><span className="text-ink-900 font-medium">{system.voltage === null ? '—' : `${system.voltage} V`}</span></div>
            <div className="flex justify-between"><span>Temperature</span><span className="text-ink-900 font-medium">{system.temperatureC === null ? '—' : `${system.temperatureC}°C`}</span></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-black/[0.04] shadow-sm shadow-black/[0.03] p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm text-ink-900 flex items-center gap-2">
              <FiShare2 className="text-brand-600" /> Interfaces
            </h3>
            <span className="text-xs text-ink-500">{overviewInterfaces.filter((i) => i.status === 'running').length}/{overviewInterfaces.length} up</span>
          </div>
          <ul className="divide-y divide-black/[0.06]">
            {overviewInterfaces.slice(0, 5).map((iface) => (
              <li key={iface.id} className="flex items-center justify-between py-2.5 px-2 -mx-2 rounded-md text-sm transition-colors duration-150 hover:bg-ink-900/[0.02]">
                <div>
                  <p className="font-medium text-ink-900">{iface.name}</p>
                  <p className="text-xs text-ink-500">{iface.type}</p>
                </div>
                <StatusPill status={iface.status} />
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white rounded-lg border border-black/[0.04] shadow-sm shadow-black/[0.03] p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm text-ink-900 flex items-center gap-2">
              <FiWifi className="text-brand-600" /> Wireless clients
            </h3>
            <span className="text-xs text-ink-500">{overviewWirelessClients.length} connected</span>
          </div>
          <ul className="divide-y divide-black/[0.06]">
            {overviewWirelessClients.slice(0, 5).map((client) => (
              <li key={client.id} className="flex items-center justify-between py-2.5 px-2 -mx-2 rounded-md text-sm transition-colors duration-150 hover:bg-ink-900/[0.02]">
                <div>
                  <p className="font-medium text-ink-900">{client.hostname}</p>
                  <p className="text-xs text-ink-500">{client.ip} · {client.ssid}</p>
                </div>
                <span className="text-xs text-ink-500">{client.signal} dBm</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function UsageBar({ label, percent }) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const id = requestAnimationFrame(() => setWidth(percent));
    return () => cancelAnimationFrame(id);
  }, [percent]);

  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-ink-700 font-medium">{label}</span>
        <span className="text-ink-500">{percent}%</span>
      </div>
      <div className="h-2 rounded-full bg-ink-900/5 overflow-hidden">
        <div
          className="h-full rounded-full bg-brand-600 transition-[width] duration-700 ease-out"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
