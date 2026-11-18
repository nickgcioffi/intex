import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createApp } from '../src/app.js';
const exec = promisify(execFile);
const deploy = path.resolve('scripts/deploy.sh');

async function fixture(mode, t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'intex-deploy-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, 'bin'));
  await mkdir(path.join(dir, 'dist'));
  await mkdir(path.join(dir, 'scripts'));
  await copyFile('scripts/verify-health.mjs', path.join(dir, 'scripts/verify-health.mjs'));
  await writeFile(path.join(dir, 'dist/application.zip'), 'control-plane-test-bundle');
  await writeFile(path.join(dir, 'bin/aws'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync('calls.log', args.join(' ') + '\\n');
if (args[1] === 'describe-environments') {
  if (args.includes('Environments[0].Status')) console.log(process.env.MODE === 'busy' ? 'Updating' : 'Ready');
  else if (args.includes('Environments[0].VersionLabel')) console.log('prior');
  else console.log(JSON.stringify({Environments:[{Status:'Ready',Health:process.env.MODE === 'asyncfailed' ? 'Red' : 'Green',VersionLabel:process.env.MODE === 'asyncfailed' ? 'prior' : process.env.VERSION,CNAME:process.env.TEST_HOST}]}));
} else if (args[1] === 'describe-events') {
  console.log(JSON.stringify({Events:process.env.MODE === 'asyncfailed' ? [{Message:'Downstream deployment denied'}] : []}));
} else if (args[1] === 'update-environment' && process.env.MODE === 'denied') {
  console.error('AccessDenied'); process.exit(1);
} else console.log('{}');
`, { mode: 0o755 });
  return { cwd: dir, env: { ...process.env, PATH: `${dir}/bin:${process.env.PATH}`, MODE: mode, VERSION: 'test-release', ARTIFACT_BUCKET: 'test-bucket' }, dir };
}
test('deployment refuses a busy environment before uploading', async (t) => {
  const f = await fixture('busy', t);
  await assert.rejects(exec('bash', [deploy], f), /expected Ready/);
  const calls = await readFile(path.join(f.dir, 'calls.log'), 'utf8');
  assert.equal(calls.includes('s3 cp'), false);
});
test('deployment surfaces AWS denial without reporting success', async (t) => {
  const f = await fixture('denied', t);
  await assert.rejects(exec('bash', [deploy], f), /AccessDenied/);
});
test('deployment verifies the actual HTTP release after mocked AWS success', async (t) => {
  const f = await fixture('ok', t);
  const server = createApp({ version: 'test-release' }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  f.env.TEST_HOST = `127.0.0.1:${server.address().port}`;
  const result = await exec('bash', [deploy], f);
  assert.match(result.stdout, /Verified \/health for test-release/);
  assert.match(result.stdout, /Deployed test-release/);
  const calls = await readFile(path.join(f.dir, 'calls.log'), 'utf8');
  assert.match(calls, /s3:\/\/test-bucket\/releases\/test-release.zip/);
  assert.match(calls, /update-environment --environment-name intex-dev --version-label test-release/);
});

test('deployment rejects missing CloudFormation output before any AWS call', async (t) => {
  const f = await fixture('ok', t);
  f.env.ARTIFACT_BUCKET = 'None';
  await assert.rejects(exec('bash', [deploy], f), /Invalid ARTIFACT_BUCKET/);
});

test('deployment fails promptly when an accepted update reports asynchronous AWS errors', async (t) => {
  const f = await fixture('asyncfailed', t);
  await assert.rejects(exec('bash', [deploy], f), /Downstream deployment denied/);
});
