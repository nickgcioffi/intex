import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
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
