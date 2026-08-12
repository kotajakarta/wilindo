import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import './env';

if (!process.env.API_KEY) {
  throw new Error('API_KEY is not set (expected in root .env)');
}

function isValidApiKey(key: string): boolean {
  const expected = Buffer.from(process.env.API_KEY as string);
  const actual = Buffer.from(key);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const key = req.header('X-API-Key');
  if (!key || !isValidApiKey(key)) {
    res.status(401).json({ error: 'API key tidak valid' });
    return;
  }
  next();
}
