import { useEffect, useState } from 'react';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatusPill from '../components/ui/StatusPill';
import DataNotice from '../components/ui/DataNotice';
import LiveUpdated from '../components/ui/LiveUpdated';
import InterfaceDetail from '../components/ui/InterfaceDetail';
import { useResource } from '../hooks/useResource';

const columns = [
  { key: 'name', header: 'Name' },
  { key: 'type', header: 'Type' },
  { key: 'status', header: 'Status', render: (row) => <StatusPill status={row.status} /> },
  { key: 'mac', header: 'MAC Address' },
  { key: 'rxRate', header: 'RX Rate (incoming)' },
  { key: 'txRate', header: 'TX Rate (outgoing)' },
  { key: 'rxBytes', header: 'Total Received' },
  { key: 'txBytes', header: 'Total Sent' },
  { key: 'comment', header: 'Comment', render: (row) => row.comment || <span className="text-ink-500/60">&mdash;</span> },
];

const REFRESH_MS = 10000;
const MAX_HISTORY_POINTS = 30; // 5 minutes of rolling history at the 10s poll interval.

export default function Interfaces() {
  const { data, error, loading, live, lastUpdated, refresh } = useResource('/interfaces', {
    fallback: [],
    refreshMs: REFRESH_MS,
  });
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState({});

  const rows = data ?? [];
  // Keeps the open detail panel in sync with the next poll instead of going stale.
  const selectedLive = selected ? rows.find((r) => r.id === selected.id) ?? selected : null;

  // RouterOS keeps no per-interface history, so this builds a short rolling window live,
  // the same way the Dashboard's traffic chart does: it starts empty and fills as the
  // page stays open, rather than showing anything from before the page was loaded.
  useEffect(() => {
    if (!live || !data) return;
    const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setHistory((prev) => {
      const next = { ...prev };
      for (const iface of data) {
        const points = next[iface.id] ? [...next[iface.id]] : [];
        points.push({
          time,
          tx: Number(((iface.txRateBps ?? 0) / 1e6).toFixed(3)),
          rx: Number(((iface.rxRateBps ?? 0) / 1e6).toFixed(3)),
          txPps: iface.txPps ?? 0,
          rxPps: iface.rxPps ?? 0,
        });
        while (points.length > MAX_HISTORY_POINTS) points.shift();
        next[iface.id] = points;
      }
      return next;
    });
    // Re-runs on every successful poll (a fresh `data` array), which is exactly the cadence
    // this should sample at — not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, live]);

  return (
    <div>
      <PageHeader
        title="Interfaces"
        description="Ethernet, wireless, and bridge interfaces on this router. Click a row for details."
      />
      <DataNotice error={error} live={live} loading={loading} onRetry={refresh} />
      {live && <LiveUpdated lastUpdated={lastUpdated} refreshMs={REFRESH_MS} />}
      <DataTable columns={columns} rows={rows} onRowClick={setSelected} />
      <InterfaceDetail
        iface={selectedLive}
        history={selectedLive ? history[selectedLive.id] ?? [] : []}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
