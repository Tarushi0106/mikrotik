import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import DataNotice from '../components/ui/DataNotice';
import { useResource } from '../hooks/useResource';
import { wirelessClients as demoWirelessClients } from '../data/mockData';

function signalTone(dbm) {
  if (dbm >= -60) return 'text-emerald-600';
  if (dbm >= -70) return 'text-amber-600';
  return 'text-brand-600';
}

const columns = [
  { key: 'hostname', header: 'Hostname' },
  { key: 'mac', header: 'MAC Address' },
  { key: 'ip', header: 'IP Address' },
  { key: 'ssid', header: 'SSID' },
  {
    key: 'signal',
    header: 'Signal',
    // Boards without a radio, and clients mid-association, report no signal at all.
    render: (row) =>
      row.signal === null || row.signal === undefined ? (
        <span className="text-ink-500/60">&mdash;</span>
      ) : (
        <span className={`font-medium ${signalTone(row.signal)}`}>{row.signal} dBm</span>
      ),
  },
  { key: 'txRate', header: 'TX Rate' },
  { key: 'rxRate', header: 'RX Rate' },
  { key: 'uptime', header: 'Uptime' },
];

export default function Wireless() {
  const { data, error, loading, live, refresh } = useResource('/wireless', {
    fallback: demoWirelessClients,
    refreshMs: 10000,
  });

  const rows = data ?? [];

  return (
    <div>
      <PageHeader
        title="Wireless Clients"
        description={`${rows.length} ${rows.length === 1 ? 'device' : 'devices'} currently associated across all SSIDs.`}
      />
      <DataNotice error={error} live={live} loading={loading} onRetry={refresh} />
      {live && rows.length === 0 && (
        <p className="mb-4 rounded-lg bg-ink-900/[0.03] px-4 py-2.5 text-xs text-ink-600">
          No wireless clients associated. If this router has no radio, or its wireless package
          is not installed, this list will always be empty.
        </p>
      )}
      <DataTable columns={columns} rows={rows} />
    </div>
  );
}
