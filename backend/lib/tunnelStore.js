import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

/**
 * Site-to-site tunnels this dashboard has provisioned between two registered devices.
 * Each record stores the WireGuard interface name it created on each side (not RouterOS's
 * internal .id, which is only meaningful within one connection) so a later teardown can
 * find the right interface again by name.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const TUNNELS_FILE = path.join(DATA_DIR, 'tunnels.json');

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(TUNNELS_FILE)) fs.writeFileSync(TUNNELS_FILE, JSON.stringify({ tunnels: [] }, null, 2));
}

function read() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(TUNNELS_FILE, 'utf8'));
  } catch {
    return { tunnels: [] };
  }
}

function write(state) {
  ensureStore();
  fs.writeFileSync(TUNNELS_FILE, JSON.stringify(state, null, 2));
}

// Tunnels created before multi-protocol support have no `type` field — treat them as
// WireGuard, the only type that existed at the time.
function withType(t) {
  return { type: 'wireguard', ...t };
}

export function listTunnels() {
  return read().tunnels.map(withType);
}

export function getTunnel(id) {
  const found = read().tunnels.find((t) => t.id === id);
  return found ? withType(found) : null;
}

export function newTunnelId() {
  return crypto.randomUUID();
}

/** `tunnel` must already include an `id` from newTunnelId() — the caller derives the
 *  interface name from that id before provisioning starts, so the two have to match. */
export function addTunnel(tunnel) {
  const state = read();
  const record = { ...tunnel, createdAt: new Date().toISOString() };
  state.tunnels.push(record);
  write(state);
  return record;
}

export function removeTunnel(id) {
  const state = read();
  state.tunnels = state.tunnels.filter((t) => t.id !== id);
  write(state);
}

/** Picks the next unused /30 out of a range reserved for tunnels, so links never collide. */
export function nextTunnelSubnet() {
  const used = new Set(read().tunnels.map((t) => t.subnet));
  const base = (10 << 24) | (200 << 16); // 10.200.0.0
  const BLOCK_COUNT = 65536 / 4; // every /30 in 10.200.0.0/16

  for (let block = 0; block < BLOCK_COUNT; block++) {
    const addr = (base + block * 4) >>> 0;
    const candidate = [24, 16, 8, 0].map((shift) => (addr >>> shift) & 255).join('.');
    const subnet = `${candidate}/30`;
    if (!used.has(subnet)) return subnet;
  }
  throw new Error('No free tunnel subnet available.');
}

/** Splits a /30 like "10.200.0.0/30" into its two usable host addresses. */
export function splitTunnelSubnet(subnet) {
  const [base, mask] = subnet.split('/');
  const octets = base.split('.').map(Number);
  const toIp = (o) => o.join('.');
  const hostA = [...octets.slice(0, 3), octets[3] + 1];
  const hostB = [...octets.slice(0, 3), octets[3] + 2];
  return { addressA: `${toIp(hostA)}/${mask}`, addressB: `${toIp(hostB)}/${mask}` };
}
