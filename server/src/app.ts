import express from 'express';
import path from 'node:path';
import { wilayahRouter } from './wilayah.routes';
import { domainSecurityGuard } from './domain-guard.middleware';

export const app = express();

app.use(express.json());

// Guard domain dan CORS untuk seluruh API
app.use('/api', domainSecurityGuard);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api', wilayahRouter);

const clientDistPath = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDistPath));

app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan, coba lagi' });
  }
);
