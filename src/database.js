import { readFileSync } from 'node:fs';
import pg from 'pg';

// Lazy and opt-in: placeholder startup and health require no DB or secret.
export function databaseConfig(env = process.env) {
  if (!env.DATABASE_URL) return null;
  let url;
  try { url = new URL(env.DATABASE_URL); } catch { throw new Error('Invalid DATABASE_URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Expected PostgreSQL URL');
  // pg query parameters can override both the host and explicit TLS options.
  if (url.search) throw new Error('URL query overrides are unsupported; configure TLS with DB_SSL_CA_FILE');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!local && !env.DB_SSL_CA_FILE) throw new Error('Remote PostgreSQL requires DB_SSL_CA_FILE');
  return { connectionString: env.DATABASE_URL, max: 3, connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000, ssl: local ? false : {
      rejectUnauthorized: true, ca: readFileSync(env.DB_SSL_CA_FILE, 'utf8'),
    } };
}
export function createDatabasePool(env = process.env) {
  const config = databaseConfig(env);
  return config ? new pg.Pool(config) : null;
}
