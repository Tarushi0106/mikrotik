const styles = {
  running: 'bg-emerald-50 text-emerald-700',
  online: 'bg-emerald-50 text-emerald-700',
  active: 'bg-emerald-50 text-emerald-700',
  bound: 'bg-emerald-50 text-emerald-700',
  accept: 'bg-emerald-50 text-emerald-700',
  waiting: 'bg-amber-50 text-amber-700',
  disabled: 'bg-ink-900/5 text-ink-500',
  offline: 'bg-ink-900/5 text-ink-500',
  drop: 'bg-brand-50 text-brand-700',
  warning: 'bg-amber-50 text-amber-700',
  info: 'bg-sky-50 text-sky-700',
};

export default function StatusPill({ status }) {
  const key = status?.toLowerCase?.() ?? '';
  const cls = styles[key] || 'bg-ink-900/5 text-ink-600';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium capitalize transition-colors duration-150 ${cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {status}
    </span>
  );
}
