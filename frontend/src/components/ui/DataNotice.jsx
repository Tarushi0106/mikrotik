import { FiAlertTriangle, FiLoader, FiRefreshCw } from 'react-icons/fi';

/**
 * Banner that makes the data source explicit. Without this, the demo fallback silently
 * looks like real router data, which is worse than showing an error.
 */
export default function DataNotice({ error, live, loading, onRetry }) {
  if (live) return null;

  if (loading) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-lg bg-ink-900/[0.03] px-4 py-2.5 text-xs text-ink-600">
        <FiLoader size={14} className="animate-spin" />
        Reading live data from the router&hellip;
      </div>
    );
  }

  if (!error) return null;

  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex items-start gap-2.5">
        <FiAlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900">
            Showing demo data &mdash; the router is not connected
          </p>
          <p className="mt-0.5 break-words text-xs text-amber-800">{error.message}</p>
          <p className="mt-1.5 text-xs text-amber-700">
            Run <code className="rounded bg-amber-100 px-1 py-0.5 font-mono">npm run probe</code> to
            diagnose the connection.
          </p>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100"
          >
            <FiRefreshCw size={13} /> Retry
          </button>
        )}
      </div>
    </div>
  );
}
