import express from 'express';
import release from './version.json' with { type: 'json' };

export function createApp({ version = release.version } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => console.log(JSON.stringify({
      event: 'request', method: req.method, path: req.path,
      status: res.statusCode, durationMs: Date.now() - started,
    })));
    next();
  });
  app.get('/', (_req, res) => res.json({ application: 'BYU IS INTEX', version }));
  // Liveness intentionally does not depend on the future database.
  app.get('/health', (_req, res) => res.json({ status: 'ok', version }));
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  return app;
}
