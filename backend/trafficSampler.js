import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { createClient } from './routeros/index.js';
import { listDevicesWithSecrets, getActiveDevice } from './lib/deviceStore.js';
import { pick, toNum, isTrue } from './lib/format.js';

/**
 * RouterOS exposes cumulative byte counters, not throughput, and keeps no queryable
 * history. So every device gets polled independently on an interval, its counters get
 * differentiated into Mbps, and each sample is appended to a local NDJSON file tagged
 * with which device it came from. That means any device's traffic can be charted by ID,
 * not just whichever one happens to be "active" — and it survives backend restarts.
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

const previousByDevice = new Map(); // deviceId -> Map(interfaceName -> { rxBytes, txBytes, rxPackets, txPackets, at })
const ratesByDevice = new Map(); // deviceId -> Map(interfaceName -> { rxBps, txBps, rxPps, txPps })
const chosenInterfaceByDevice = new Map(); // deviceId -> interfaceName

let timer = null;
let trimTimer = null;
let sampling = false;
let lastError = null;
let lastSampleAt = null;

/** Rates for one device's interfaces; defaults to whichever device is currently active. */
export function getRates(deviceId) {
  const id = deviceId ?? getActiveDevice()?.id;
  return (id && ratesByDevice.get(id)) ?? new Map();
}

export function getSamplerStatus() {
  const activeId = getActiveDevice()?.id;
  return {
    running: timer !== null,
    intervalMs: config.traffic.intervalMs,
    trackedInterface: activeId ? chosenInterfaceByDevice.get(activeId) ?? null : null,
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
 * takes priority over `range`; otherwise `range` is one of the RANGE_MS keys. `deviceId`
 * scopes the chart to one device — defaults to whichever device is currently active.
 */
export function queryHistory({ range, date, deviceId } = {}) {
  const id = deviceId ?? getActiveDevice()?.id;
  if (!id) return [];

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
    .filter((s) => s.deviceId === id && s.t >= from && s.t <= to)
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

/** Samples one device: connects just for this tick, diffs counters, appends a point. */
async function sampleDevice(device, now) {
  let client = null;
  try {
    client = await createClient({
      host: device.host,
      user: device.user,
      password: device.password,
      mode: device.apiMode,
    });
    const records = await client.list('interface');

    const previous = previousByDevice.get(device.id) ?? new Map();
    const rates = ratesByDevice.get(device.id) ?? new Map();
    previousByDevice.set(device.id, previous);
    ratesByDevice.set(device.id, rates);

    const chosen = chooseInterface(records) ?? chosenInterfaceByDevice.get(device.id) ?? null;
    if (chosen) chosenInterfaceByDevice.set(device.id, chosen);

    for (const record of records) {
      const name = pick(record, 'name');
      if (!name) continue;

      const rxBytes = toNum(pick(record, 'rx-byte'));
      const txBytes = toNum(pick(record, 'tx-byte'));
      const rxPackets = toNum(pick(record, 'rx-packet'));
      const txPackets = toNum(pick(record, 'tx-packet'));
      const prev = previous.get(name);
      previous.set(name, { rxBytes, txBytes, rxPackets, txPackets, at: now });

      if (!prev) continue;

      const elapsedSec = (now - prev.at) / 1000;
      if (elapsedSec <= 0) continue;

      // Counters reset on reboot or interface clear, which shows up as a negative delta.
      const rxDelta = Math.max(0, rxBytes - prev.rxBytes);
      const txDelta = Math.max(0, txBytes - prev.txBytes);
      const rxPacketDelta = Math.max(0, rxPackets - prev.rxPackets);
      const txPacketDelta = Math.max(0, txPackets - prev.txPackets);

      rates.set(name, {
        rxBps: (rxDelta * 8) / elapsedSec,
        txBps: (txDelta * 8) / elapsedSec,
        rxPps: rxPacketDelta / elapsedSec,
        txPps: txPacketDelta / elapsedSec,
      });
    }

    const tracked = chosen ? rates.get(chosen) : null;
    if (tracked) {
      appendSample({
        t: now,
        deviceId: device.id,
        rx: Number((tracked.rxBps / 1e6).toFixed(3)),
        tx: Number((tracked.txBps / 1e6).toFixed(3)),
      });
    }

    if (device.id === getActiveDevice()?.id) lastError = null;
  } catch (err) {
    if (device.id === getActiveDevice()?.id) lastError = err.message;
    // Drop this device's counters so the next tick starts a fresh baseline instead of
    // computing a huge bogus delta across the gap.
    previousByDevice.delete(device.id);
  } finally {
    if (client) await client.close().catch(() => {});
  }
}

async function sample() {
  // A slow/unreachable device could make one tick run past the next scheduled one;
  // skip firing again until the current round finishes instead of piling up connections.
  if (sampling) return;
  sampling = true;
  try {
    const now = Date.now();
    const devices = listDevicesWithSecrets();
    await Promise.all(devices.map((d) => sampleDevice(d, now)));
    lastSampleAt = new Date(now).toISOString();
  } finally {
    sampling = false;
  }
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
