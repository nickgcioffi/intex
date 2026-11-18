import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { databaseConfig, createDatabasePool } from '../src/database.js';

test('health works without a database and identifies deployed version', async () => {
  const response = await request(createApp({ version: 'abc123' })).get('/health').expect(200);
  assert.deepEqual(response.body, { status: 'ok', version: 'abc123' });
  assert.equal(response.headers['x-powered-by'], undefined);
});
test('root and missing routes have predictable responses', async () => {
  const app = createApp();
  await request(app).get('/').expect(200).expect(/BYU IS INTEX/);
  await request(app).get('/missing').expect(404, { error: 'Not found' });
});
test('database is opt-in and remote connections require verified TLS', () => {
  assert.equal(createDatabasePool({}), null);
  assert.equal(databaseConfig({ DATABASE_URL: 'postgres://u:p@localhost/db' }).ssl, false);
  assert.throws(() => databaseConfig({ DATABASE_URL: 'postgres://u:p@rds.example/db' }), /CA_FILE/);
  assert.throws(() => databaseConfig({ DATABASE_URL: 'postgres://u:p@localhost/db?sslmode=disable' }), /TLS/);
  assert.throws(() => databaseConfig({ DATABASE_URL: 'https://example.com' }), /PostgreSQL/);
});

test('remote database config verifies certificates and forbids host/TLS URL overrides', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'intex-db-'));
  try {
    const ca = path.join(dir, 'ca.pem');
    writeFileSync(ca, 'test-ca');
    const config = databaseConfig({ DATABASE_URL: 'postgres://u:p@database.example/db', DB_SSL_CA_FILE: ca });
    assert.equal(config.ssl.rejectUnauthorized, true);
    assert.equal(config.ssl.ca, 'test-ca');
    for (const query of ['ssl=0', 'sslmode=disable', 'host=remote.example']) {
      assert.throws(() => databaseConfig({ DATABASE_URL: `postgres://u:p@localhost/db?${query}` }), /overrides/);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
