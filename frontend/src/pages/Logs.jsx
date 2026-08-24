import PageHeader from '../components/ui/PageHeader';
import DataNotice from '../components/ui/DataNotice';
import { useResource } from '../hooks/useResource';

const topicTone = (topic) => {
  if (topic.includes('warning')) return 'bg-amber-50 text-amber-700';
  if (topic.includes('firewall')) return 'bg-brand-50 text-brand-700';
  return 'bg-ink-900/5 text-ink-600';
};

export default function Logs() {
  const { data, error, loading, live, refresh } = useResource('/logs', {
    fallback: [],
    refreshMs: 15000,
  });
  const logs = data ?? [];

  return (
    <div>
      <PageHeader
        title="System Logs"
        description="Recent router log events across system, firewall, wireless, and DHCP topics."
      />
      <DataNotice error={error} live={live} loading={loading} onRetry={refresh} />
      <div className="bg-white rounded-lg border border-black/[0.04] shadow-sm shadow-black/[0.03] divide-y divide-black/[0.06]">
        {logs.map((log) => (
          <div key={log.id} className="px-4 py-3 flex flex-wrap items-start gap-x-3 gap-y-1 text-sm transition-colors duration-150 hover:bg-ink-900/[0.02]">
            <span className="text-ink-500 font-mono text-xs shrink-0 w-40">{log.time}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${topicTone(log.topic)}`}>
              {log.topic}
            </span>
            <span className="text-ink-900">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
