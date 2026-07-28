import net from 'node:net';
import { config } from './config.js';
import { createRestClient } from './routeros/restClient.js';
import { createBinaryClient } from './routeros/binaryClient.js';
import { pick } from './lib/format.js';

/**
 * Standalone connectivity diagnostic: `npm run probe`
 *
 * Works from the outside in - TCP reachability first, then each API - so a failure tells
 * you which layer is actually broken instead of just "could not connect".
 */

const PORTS = [
  { port: 80, label: 'www (REST over HTTP, v7)' },
  { port: 443, label: 'www-ssl (REST over HTTPS, v7)' },
  { port: 8728, label: 'api (binary, v6 + v7)' },
  { port: 8729, label: 'api-ssl (binary over TLS)' },
  { port: 8291, label: 'winbox' },
  { port: 22, label: 'ssh' },
];

function checkPort(host, port, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const done = (open, note) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ port, open, note });
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false, 'timeout — filtered or host down'));
    socket.once('error', (err) => done(false, err.code === 'ECONNREFUSED' ? 'refused — service disabled' : err.code));
    socket.connect(port, host);
  });
}

function line(char = '─', width = 66) {
  return char.repeat(width);
}

async function main() {
  const { host, user, password, restProtocol, restPort, binaryPort } = config.router;

  console.log(`\n${line()}`);
  console.log('  MikroTik connectivity probe');
  console.log(line());
  console.log(`  host        ${host}`);
  console.log(`  user        ${user}`);
  console.log(`  password    ${password ? `set (${password.length} chars)` : 'EMPTY'}`);
  console.log(`  api mode    ${config.router.mode}`);
  console.log(`${line()}\n`);

  if (!password) {
    console.log('  Note: no MIKROTIK_PASSWORD set. A blank password is valid on a');
    console.log('  factory-default router, but fails once one has been configured.\n');
  }

  console.log('  1. TCP port scan');
  const results = await Promise.all(PORTS.map((p) => checkPort(host, p.port)));
  let anyOpen = false;
  for (const [index, result] of results.entries()) {
    const meta = PORTS[index];
    const mark = result.open ? 'OPEN  ' : 'closed';
    if (result.open) anyOpen = true;
    console.log(`     ${mark} ${String(meta.port).padEnd(6)} ${meta.label}${result.note ? `  (${result.note})` : ''}`);
  }

  if (!anyOpen) {
    console.log(`\n  Nothing is listening on ${host}. The router is not reachable at all.`);
    console.log('  Work through these in order:');
    console.log('     - Is the device powered? Check for a lit LED.');
    console.log('     - Are you cabled into ether2/3/4? ether1 is the WAN port and is');
    console.log('       firewalled against management by default.');
    console.log('     - Does your laptop have an address on the same subnet?');
    console.log(`       Run:  ping ${host}`);
    console.log('     - If the IP is unknown, use WinBox and search the Neighbors tab.');
    console.log('       WinBox finds routers over Layer 2, without needing a correct IP.');
    console.log(`\n${line()}\n`);
    process.exitCode = 1;
    return;
  }

  console.log('\n  2. REST API (RouterOS v7 only)');
  const rest = createRestClient({
    host,
    user,
    password,
    protocol: restProtocol,
    port: restPort,
    rejectUnauthorized: config.router.rejectUnauthorized,
    timeoutMs: config.router.timeoutMs,
  });

  let working = null;
  try {
    const resource = await rest.get('system/resource');
    console.log(`     OK — RouterOS ${pick(resource, 'version')} on ${pick(resource, 'board-name')}`);
    working = rest;
  } catch (err) {
    console.log(`     unavailable — ${err.message}`);
    if (err.code === 'AUTH') {
      console.log('     Credentials are wrong. Everything else below will fail too.');
    } else {
      console.log('     Expected on RouterOS v6, which has no REST API. Enable it on v7 with:');
      console.log('       /ip service enable www-ssl');
    }
  }

  console.log('\n  3. Binary API (RouterOS v6 and v7)');
  const binary = createBinaryClient({
    host,
    user,
    password,
    port: binaryPort,
    timeoutMs: config.router.timeoutMs,
  });

  try {
    const resource = await binary.get('system/resource');
    console.log(`     OK — RouterOS ${pick(resource, 'version')} on ${pick(resource, 'board-name')}`);
    if (!working) working = binary;
  } catch (err) {
    console.log(`     unavailable — ${err.message}`);
    if (err.code === 'REFUSED') {
      console.log('     Enable it on the router with:  /ip service enable api');
    }
  }

  if (!working) {
    console.log(`\n  Ports are open but no API answered. Enable one in IP -> Services.`);
    console.log(`\n${line()}\n`);
    await rest.close();
    await binary.close();
    process.exitCode = 1;
    return;
  }

  console.log(`\n  4. Reading live data over the ${working.kind} API`);
  try {
    const [identity, interfaces, addresses, leases] = await Promise.all([
      working.get('system/identity').catch(() => null),
      working.list('interface').catch(() => []),
      working.list('ip/address').catch(() => []),
      working.list('ip/dhcp-server/lease').catch(() => []),
    ]);

    console.log(`     identity        ${pick(identity, 'name') ?? 'unknown'}`);
    console.log(`     interfaces      ${interfaces.length}`);
    console.log(`     ip addresses    ${addresses.length}`);
    console.log(`     dhcp leases     ${leases.length}`);

    let wireless = [];
    for (const path of [
      'interface/wireless/registration-table',
      'interface/wifi/registration-table',
    ]) {
      try {
        wireless = await working.list(path);
        break;
      } catch {
        // Try the next menu name; absent on boards with no radio.
      }
    }
    console.log(`     wifi clients    ${wireless.length}`);

    console.log(`\n  Success. Set MIKROTIK_API=${working.kind} in .env to skip auto-detection,`);
    console.log('  then start the backend with:  npm run server');
  } catch (err) {
    console.log(`     failed while reading — ${err.message}`);
    console.log('     The account may lack read permission. Check its group in /user.');
    process.exitCode = 1;
  }

  console.log(`\n${line()}\n`);
  await rest.close();
  await binary.close();
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (err) => {
    console.error('\n  Probe crashed:', err);
    process.exit(1);
  },
);
