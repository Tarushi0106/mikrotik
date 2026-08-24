import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatusPill from '../components/ui/StatusPill';
import DataNotice from '../components/ui/DataNotice';
import { useResource } from '../hooks/useResource';

const columns = [
  { key: 'address', header: 'IP Address' },
  { key: 'mac', header: 'MAC Address' },
  { key: 'hostname', header: 'Hostname' },
  { key: 'status', header: 'Status', render: (row) => <StatusPill status={row.status} /> },
  { key: 'expiresIn', header: 'Expires In' },
];

export default function Dhcp() {
  const { data, error, loading, live, refresh } = useResource('/dhcp', {
    fallback: [],
    refreshMs: 15000,
  });

  return (
    <div>
      <PageHeader
        title="DHCP Leases"
        description="Active and pending IP address leases handed out to LAN clients."
      />
      <DataNotice error={error} live={live} loading={loading} onRetry={refresh} />
      <DataTable columns={columns} rows={data ?? []} />
    </div>
  );
}
