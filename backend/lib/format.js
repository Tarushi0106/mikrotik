/**
 * RouterOS returns everything as strings, and key naming differs slightly between the
 * REST and binary transports (".id" vs "id"). These helpers absorb both.
 */

/** Reads the first present key from a record, tolerating ".id"/"id" style variants. */
export function pick(record, ...keys) {
  if (!record) return undefined;
  for (const key of keys) {
    if (record[key] !== undefined) return record[key];
    const dotted = `.${key}`;
    if (record[dotted] !== undefined) return record[dotted];
    const undotted = key.replace(/^\./, '');
    if (record[undotted] !== undefined) return record[undotted];
  }
  return undefined;
}

export function toNum(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseFloat(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** RouterOS booleans arrive as the strings "true"/"false"/"yes"/"no". */
export function isTrue(value) {
  return value === true || value === 'true' || value === 'yes';
}

export function bytesToMB(value) {
  return Math.round(toNum(value) / (1024 * 1024));
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatBytes(value) {
  let bytes = toNum(value);
  if (bytes <= 0) return '0 B';
  let unit = 0;
  while (bytes >= 1024 && unit < BYTE_UNITS.length - 1) {
    bytes /= 1024;
    unit += 1;
  }
  return `${trimZero(bytes.toFixed(1))} ${BYTE_UNITS[unit]}`;
}

const RATE_UNITS = ['bps', 'Kbps', 'Mbps', 'Gbps'];

export function formatRate(bitsPerSecond) {
  let bits = toNum(bitsPerSecond);
  if (bits < 1) return '0 bps';
  let unit = 0;
  while (bits >= 1000 && unit < RATE_UNITS.length - 1) {
    bits /= 1000;
    unit += 1;
  }
  return `${trimZero(bits.toFixed(1))} ${RATE_UNITS[unit]}`;
}

function trimZero(text) {
  return text.replace(/\.0$/, '');
}

/**
 * Converts a RouterOS duration to seconds. Handles both the letter form ("6w2d3h4m5s")
 * and the mixed form ("46d08:12:47") that different menus and versions emit.
 */
export function durationToSeconds(value) {
  if (value === undefined || value === null || value === '') return 0;
  const text = String(value).trim();
  let seconds = 0;

  const letters = text.matchAll(/(\d+)\s*(w|d|h|m|s)/g);
  for (const [, amount, unit] of letters) {
    const n = Number.parseInt(amount, 10);
    if (unit === 'w') seconds += n * 604800;
    else if (unit === 'd') seconds += n * 86400;
    else if (unit === 'h') seconds += n * 3600;
    else if (unit === 'm') seconds += n * 60;
    else seconds += n;
  }

  const clock = text.match(/(\d+):(\d{2}):(\d{2})/);
  if (clock) {
    seconds +=
      Number.parseInt(clock[1], 10) * 3600 +
      Number.parseInt(clock[2], 10) * 60 +
      Number.parseInt(clock[3], 10);
  }

  return seconds;
}

/** Formats a duration the way the UI expects: "46d 08:12:47". */
export function formatUptime(value) {
  const total = durationToSeconds(value);
  if (total <= 0) return '—';
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const clock = [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
  return days > 0 ? `${days}d ${clock}` : clock;
}

/** Shorter form used in table cells: "5h 12m", "1d 04h". */
export function formatDurationShort(value) {
  const total = durationToSeconds(value);
  if (total <= 0) return '—';
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days}d ${String(hours).padStart(2, '0')}h`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return `${minutes}m`;
}

/** "-52@1Mbps" or "-52dBm" -> -52 */
export function parseSignal(value) {
  if (value === undefined || value === null || value === '') return null;
  const match = String(value).match(/-?\d+/);
  return match ? Number.parseInt(match[0], 10) : null;
}

export function normalizeMac(value) {
  return value ? String(value).toUpperCase() : '';
}

/** Strips the "(stable)" suffix RouterOS appends to its version string. */
export function cleanVersion(value) {
  if (!value) return null;
  return String(value).split(/\s+/)[0];
}
