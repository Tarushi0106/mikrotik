import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import DataNotice from '../components/ui/DataNotice';
import { useResource } from '../hooks/useResource';
import { ipAddresses as demoIpAddresses } from '../data/mockData';

const columns = [
  { key: 'address', header: 'Address' },
  { key: 'network', header: 'Network' },
  { key: 'interface', header: 'Interface' },
  { key: 'comment', header: 'Comment' },
];

export default function IpAddresses() {
  const { data, error, loading, live, refresh } = useResource('/ip-addresses', {
    fallback: demoIpAddresses,
    refreshMs: 15000,
  });

  return (
    <div>
      <PageHeader
        title="IP Addresses"
        description="Addresses assigned across router interfaces and VLANs."
      />
      <DataNotice error={error} live={live} loading={loading} onRetry={refresh} />
      <DataTable columns={columns} rows={data ?? []} />
    </div>
  );
}
