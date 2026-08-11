import express from 'express';
import cors from 'cors';
import { wilayahRouter } from './wilayah.routes';

export const app = express();

app.use(cors());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api', wilayahRouter);

app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan, coba lagi' });
  }
);
