import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { wilayahRouter } from './wilayah.routes';

export const app = express();

app.use(cors());

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
