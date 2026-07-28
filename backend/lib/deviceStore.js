import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

/**
 * The list of MikroTik devices this dashboard can talk to. One is "active" at a time —
 * that is the device every /api/* data route currently reads from. Switching devices
 * just repoints the shared RouterOS client (see routeros/index.js's activateDevice).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DEVICES_FILE = path.join(DATA_DIR, 'devices.json');

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DEVICES_FILE)) {
    fs.writeFileSync(DEVICES_FILE, JSON.stringify({ devices: [], activeId: null }, null, 2));
  }
}

function read() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf8'));
  } catch {
    return { devices: [], activeId: null };
  }
}

function write(state) {
  ensureStore();
  fs.writeFileSync(DEVICES_FILE, JSON.stringify(state, null, 2));
}

/** Never includes the stored password — that only ever travels to routeros/index.js. */
export function listDevices() {
  const { devices, activeId } = read();
  return devices.map(({ password: _pw, ...rest }) => ({ ...rest, active: rest.id === activeId }));
}

export function getDevice(id) {
  return read().devices.find((d) => d.id === id) ?? null;
}

export function getActiveDevice() {
  const { devices, activeId } = read();
  return devices.find((d) => d.id === activeId) ?? null;
}

export function addDevice({ name, host, user, password, apiMode }) {
  const state = read();
  const device = {
    id: crypto.randomUUID(),
    name: name?.trim() || host,
    host,
    user,
    password,
    apiMode: apiMode || 'auto',
    createdAt: new Date().toISOString(),
  };
  state.devices.push(device);
  if (!state.activeId) state.activeId = device.id;
  write(state);
  return device;
}

/** Returns the new active device id (or null if none remain). */
export function removeDevice(id) {
  const state = read();
  state.devices = state.devices.filter((d) => d.id !== id);
  if (state.activeId === id) state.activeId = state.devices[0]?.id ?? null;
  write(state);
  return state.activeId;
}

export function setActiveDevice(id) {
  const state = read();
  if (!state.devices.some((d) => d.id === id)) throw new Error('Unknown device.');
  state.activeId = id;
  write(state);
}
