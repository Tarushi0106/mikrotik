import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

/**
 * Local admin accounts for signing into the NetControl dashboard itself — separate from
 * any MikroTik device's own credentials, which now live in deviceStore.js instead.
 * Passwords are hashed with scrypt (Node's built-in, no extra dependency needed).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
}

function readUsers() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeUsers(users) {
  ensureStore();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
}

export function hasAnyUser() {
  return readUsers().length > 0;
}

export function findUser(username) {
  return readUsers().find((u) => u.username.toLowerCase() === username.toLowerCase());
}

export function createUser({ username, password }) {
  const users = readUsers();
  if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    throw new Error('That admin ID is already taken.');
  }
  const { salt, hash } = hashPassword(password);
  users.push({ username, salt, hash, createdAt: new Date().toISOString() });
  writeUsers(users);
}

export function verifyUser({ username, password }) {
  const user = findUser(username);
  if (!user) return false;
  const { hash } = hashPassword(password, user.salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(user.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
