import { setTimeout as sleep } from 'node:timers/promises';
const [endpoint, expected] = process.argv.slice(2);
if (!endpoint || !expected) throw new Error('Usage: node scripts/verify-health.mjs ENDPOINT EXPECTED_VERSION');
const url = new URL('/health', endpoint);
if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Expected HTTP endpoint');
let last;
for (let attempt = 0; attempt < 24; attempt++) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000), cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    if (body.status !== 'ok' || body.version !== expected) throw new Error('Unhealthy or wrong release version');
    console.log(`Verified /health for ${expected}`);
    process.exit(0);
  } catch (error) { last = error; }
  await sleep(5000);
}
throw last;
