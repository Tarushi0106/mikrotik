import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatusPill from '../components/ui/StatusPill';
import DataNotice from '../components/ui/DataNotice';
import { useResource } from '../hooks/useResource';
import { interfaces as demoInterfaces } from '../data/mockData';

const columns = [
  { key: 'name', header: 'Name' },
  { key: 'type', header: 'Type' },
  { key: 'status', header: 'Status', render: (row) => <StatusPill status={row.status} /> },
  { key: 'mac', header: 'MAC Address' },
  { key: 'rxRate', header: 'RX Rate' },
  { key: 'txRate', header: 'TX Rate' },
  { key: 'comment', header: 'Comment', render: (row) => row.comment || <span className="text-ink-500/60">&mdash;</span> },
];

export default function Interfaces() {
  const { data, error, loading, live, refresh } = useResource('/interfaces', {
    fallback: demoInterfaces,
    refreshMs: 10000,
  });

  return (
    <div>
      <PageHeader
        title="Interfaces"
        description="Ethernet, wireless, and bridge interfaces on this router."
      />
      <DataNotice error={error} live={live} loading={loading} onRetry={refresh} />
      <DataTable columns={columns} rows={data ?? []} />
    </div>
  );
}
