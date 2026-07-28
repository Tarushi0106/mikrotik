import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatusPill from '../components/ui/StatusPill';
import DataNotice from '../components/ui/DataNotice';
import { useResource } from '../hooks/useResource';
import { users as demoUsers } from '../data/mockData';

const columns = [
  { key: 'username', header: 'Username' },
  { key: 'fullName', header: 'Full Name' },
  { key: 'role', header: 'Permission Group' },
  { key: 'lastLogin', header: 'Last Login' },
  { key: 'status', header: 'Status', render: (row) => <StatusPill status={row.status} /> },
];

export default function Users() {
  const { data, error, loading, live, refresh } = useResource('/users', {
    fallback: demoUsers,
    refreshMs: 15000,
  });

  return (
    <div>
      <PageHeader
        title="Users"
        description="Accounts with access to this router's configuration."
      />
      <DataNotice error={error} live={live} loading={loading} onRetry={refresh} />
      <DataTable columns={columns} rows={data ?? []} />
    </div>
  );
}
