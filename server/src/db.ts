import { createPool } from 'mysql2/promise';
import './env';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set (expected in root .env)');
}

export const pool = createPool(process.env.DATABASE_URL);
