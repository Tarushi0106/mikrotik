import { useEffect, useState } from 'react';
import { FiRefreshCw } from 'react-icons/fi';

function secondsAgo(timestamp) {
  return Math.max(0, Math.round((Date.now() - timestamp) / 1000));
}

/** Small ticking "updated Ns ago" label, so an auto-refreshing page visibly proves it. */
export default function LiveUpdated({ lastUpdated, refreshMs }) {
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!lastUpdated) return null;

  const seconds = secondsAgo(lastUpdated);
  const label = seconds < 1 ? 'just now' : `${seconds}s ago`;

  return (
    <div className="flex items-center gap-1.5 text-xs text-ink-500 mb-3">
      <FiRefreshCw size={12} className={seconds < 2 ? 'animate-spin' : ''} />
      Updated {label}
      {refreshMs > 0 && <span className="text-ink-400">&middot; refreshes every {Math.round(refreshMs / 1000)}s</span>}
    </div>
  );
}
