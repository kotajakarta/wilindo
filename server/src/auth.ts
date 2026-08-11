import type { Request, Response, NextFunction } from 'express';
import './env';

if (!process.env.API_KEY) {
  throw new Error('API_KEY is not set (expected in root .env)');
}

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const key = req.header('X-API-Key');
  if (!key || key !== process.env.API_KEY) {
    res.status(401).json({ error: 'API key tidak valid' });
    return;
  }
  next();
}
