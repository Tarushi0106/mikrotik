import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { getClient, resetClient } from './routeros/index.js';
import { pick, toNum, isTrue } from './lib/format.js';

/**
 * RouterOS exposes cumulative byte counters, not throughput, and keeps no queryable
 * history. So we poll the counters on an interval, differentiate them into Mbps, and
 * append every sample to a local NDJSON file (one JSON object per line). Unlike the
 * previous in-memory-only ring buffer, this survives backend restarts and lets the
 * dashboard query arbitrary ranges (last 10 minutes, last 30 days, a specific date)
 * instead of only ever seeing "since the process last started".
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'traffic-history.ndjson');

const RETENTION_MS = 90 * 24 * 60 * 60 * 1000; // Raw samples older than this are dropped.
const MAX_CHART_POINTS = 288; // Keeps the payload small regardless of how wide the range is.

const RANGE_MS = {
  '10m': 10 * 60 * 1000,
  '20m': 20 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

const previous = new Map(); // interface name -> { rxBytes, txBytes, at }
const rates = new Map(); // interface name -> { rxBps, txBps }

let timer = null;
let trimTimer = null;
let lastError = null;
let lastSampleAt = null;
let chosenInterface = config.traffic.interface || null;

export function getRates() {
  return rates;
}

export function getSamplerStatus() {
  return {
    running: timer !== null,
    intervalMs: config.traffic.intervalMs,
    trackedInterface: chosenInterface,
    lastSampleAt,
    lastError,
  };
}

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(HISTORY_FILE)) fs.writeFileSync(HISTORY_FILE, '');
}

function appendSample(entry) {
  ensureStore();
  fs.appendFile(HISTORY_FILE, `${JSON.stringify(entry)}\n`, () => {});
}

function readAllSamples() {
  ensureStore();
  const text = fs.readFileSync(HISTORY_FILE, 'utf8');
  if (!text) return [];
  const out = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // Skip a corrupt/partial line (e.g. from a crash mid-write) rather than fail the whole read.
    }
  }
  return out;
}

/** Drops raw samples older than the retention window so the file does not grow forever. */
function trimOldSamples() {
  const cutoff = Date.now() - RETENTION_MS;
  const kept = readAllSamples().filter((s) => s.t >= cutoff);
  const body = kept.map((s) => JSON.stringify(s)).join('\n');
  fs.writeFileSync(HISTORY_FILE, kept.length ? `${body}\n` : '');
}

function formatLabel(t, spanMs) {
  const d = new Date(t);
  // Ranges spanning more than a day and a half need the date too, not just the clock.
  if (spanMs > 36 * 60 * 60 * 1000) {
    return d.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Reads the requested window from disk and bucket-averages it down to a chart-friendly
 * number of points. `date` (a "YYYY-MM-DD" string) picks one specific calendar day and
 * takes priority over `range`; otherwise `range` is one of the RANGE_MS keys.
 */
export function queryHistory({ range, date } = {}) {
  let from;
  let to;

  if (date) {
    const day = new Date(`${date}T00:00:00`);
    from = day.getTime();
    to = from + 24 * 60 * 60 * 1000;
  } else {
    const rangeMs = RANGE_MS[range] ?? RANGE_MS['24h'];
    to = Date.now();
    from = to - rangeMs;
  }

  const filtered = readAllSamples()
    .filter((s) => s.t >= from && s.t <= to)
    .sort((a, b) => a.t - b.t);

  if (!filtered.length) return [];

  const spanMs = to - from;
  const bucketMs = Math.max(config.traffic.intervalMs, Math.ceil(spanMs / MAX_CHART_POINTS));

  const buckets = new Map();
  for (const s of filtered) {
    const bucketStart = from + Math.floor((s.t - from) / bucketMs) * bucketMs;
    const bucket = buckets.get(bucketStart) ?? { rxSum: 0, txSum: 0, count: 0 };
    bucket.rxSum += s.rx;
    bucket.txSum += s.tx;
    bucket.count += 1;
    buckets.set(bucketStart, bucket);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([t, bucket]) => ({
      time: formatLabel(t, spanMs),
      rx: Number((bucket.rxSum / bucket.count).toFixed(2)),
      tx: Number((bucket.txSum / bucket.count).toFixed(2)),
    }));
}

/**
 * Picks the interface to chart when none is configured: the running physical interface
 * moving the most bytes. Bridges are skipped because their counters double-count the
 * member ports beneath them.
 */
function chooseInterface(records) {
  if (config.traffic.interface) return config.traffic.interface;

  let best = null;
  let bestBytes = -1;

  for (const record of records) {
    if (!isTrue(pick(record, 'running'))) continue;
    const type = String(pick(record, 'type') ?? '').toLowerCase();
    if (type.startsWith('bridge')) continue;

    const total = toNum(pick(record, 'rx-byte')) + toNum(pick(record, 'tx-byte'));
    if (total > bestBytes) {
      bestBytes = total;
      best = pick(record, 'name');
    }
  }

  return best;
}

async function sample() {
  let records;
  try {
    const client = await getClient();
    records = await client.list('interface');
    lastError = null;
  } catch (err) {
    lastError = err.message;
    // Drop the shared client so the next tick redials rather than reusing a dead socket.
    await resetClient().catch(() => {});
    return;
  }

  const now = Date.now();
  chosenInterface = chooseInterface(records) ?? chosenInterface;

  for (const record of records) {
    const name = pick(record, 'name');
    if (!name) continue;

    const rxBytes = toNum(pick(record, 'rx-byte'));
    const txBytes = toNum(pick(record, 'tx-byte'));
    const prev = previous.get(name);
    previous.set(name, { rxBytes, txBytes, at: now });

    if (!prev) continue;

    const elapsedSec = (now - prev.at) / 1000;
    if (elapsedSec <= 0) continue;

    // Counters reset on reboot or interface clear, which shows up as a negative delta.
    const rxDelta = Math.max(0, rxBytes - prev.rxBytes);
    const txDelta = Math.max(0, txBytes - prev.txBytes);

    rates.set(name, {
      rxBps: (rxDelta * 8) / elapsedSec,
      txBps: (txDelta * 8) / elapsedSec,
    });
  }

  const tracked = chosenInterface ? rates.get(chosenInterface) : null;
  if (tracked) {
    appendSample({
      t: now,
      rx: Number((tracked.rxBps / 1e6).toFixed(3)),
      tx: Number((tracked.txBps / 1e6).toFixed(3)),
    });
  }

  lastSampleAt = new Date(now).toISOString();
}

export function startSampler() {
  if (timer) return;
  ensureStore();
  trimOldSamples();

  // Fire once immediately to seed the counters, then settle into the interval.
  sample().catch(() => {});
  timer = setInterval(() => {
    sample().catch(() => {});
  }, config.traffic.intervalMs);
  timer.unref?.();

  trimTimer = setInterval(trimOldSamples, 24 * 60 * 60 * 1000);
  trimTimer.unref?.();
}

export function stopSampler() {
  if (timer) clearInterval(timer);
  if (trimTimer) clearInterval(trimTimer);
  timer = null;
  trimTimer = null;
}
