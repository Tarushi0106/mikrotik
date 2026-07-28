import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatusPill from '../components/ui/StatusPill';
import DataNotice from '../components/ui/DataNotice';
import { useResource } from '../hooks/useResource';
import { firewallRules as demoFirewallRules } from '../data/mockData';

const columns = [
  { key: 'chain', header: 'Chain' },
  { key: 'action', header: 'Action', render: (row) => <StatusPill status={row.action} /> },
  { key: 'protocol', header: 'Protocol' },
  { key: 'srcAddress', header: 'Source' },
  { key: 'dstPort', header: 'Dst Port' },
  { key: 'bytes', header: 'Bytes' },
  { key: 'comment', header: 'Comment' },
  {
    key: 'disabled',
    header: 'State',
    render: (row) => <StatusPill status={row.disabled ? 'disabled' : 'active'} />,
  },
];

export default function Firewall() {
  const { data, error, loading, live, refresh } = useResource('/firewall', {
    fallback: demoFirewallRules,
    refreshMs: 15000,
  });

  return (
    <div>
      <PageHeader
        title="Firewall Rules"
        description="Filter rules applied to input and forward chains, in evaluation order."
      />
      <DataNotice error={error} live={live} loading={loading} onRetry={refresh} />
      <DataTable columns={columns} rows={data ?? []} />
    </div>
  );
}
