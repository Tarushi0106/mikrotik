import useCountUp from '../../hooks/useCountUp';

const VALUE_PATTERN = /^(-?\d+(?:\.\d+)?)(.*)$/;

export default function StatCard({ icon: Icon, label, value, sub, tone = 'brand' }) {
  const toneClasses = {
    brand: 'bg-brand-50 text-brand-600',
    ink: 'bg-ink-900/5 text-ink-700',
  }[tone];

  const match = typeof value === 'string' ? value.match(VALUE_PATTERN) : null;
  const numeric = match ? parseFloat(match[1]) : null;
  const decimals = match && match[1].includes('.') ? match[1].split('.')[1].length : 0;
  const suffix = match ? match[2] : '';
  const animated = useCountUp(numeric ?? 0, 700);

  const display = match
    ? `${animated.toFixed(decimals)}${suffix}`
    : value;

  return (
    <div className="group bg-white rounded-lg border border-black/[0.04] shadow-sm shadow-black/[0.03] p-5 flex items-start gap-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-black/5">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105 ${toneClasses}`}>
        <Icon size={19} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-ink-500">{label}</p>
        <p className="text-xl font-semibold text-ink-900 truncate tabular-nums">{display}</p>
        {sub && <p className="text-xs text-ink-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
