import { Router } from 'express';
import { pool } from './db';
import { requireApiKey } from './auth';
import {
  getChildren,
  searchWilayah,
  createWilayah,
  updateWilayahNama,
  deleteWilayah,
  type WilayahLevel,
  type WilayahMutationError,
} from './wilayah.service';

export const wilayahRouter = Router();

function mutationErrorStatus(error: WilayahMutationError): number {
  switch (error) {
    case 'invalid_kode_format':
      return 400;
    case 'parent_not_found':
      return 404;
    case 'duplicate_kode':
      return 409;
    case 'not_found':
      return 404;
    case 'has_children':
      return 409;
  }
}

function mutationErrorMessage(error: WilayahMutationError): string {
  switch (error) {
    case 'invalid_kode_format':
      return 'Format kode tidak valid untuk level ini';
    case 'parent_not_found':
      return 'Kode induk tidak ditemukan';
    case 'duplicate_kode':
      return 'Kode sudah terdaftar';
    case 'not_found':
      return 'Wilayah tidak ditemukan';
    case 'has_children':
      return 'Tidak bisa dihapus, masih ada wilayah di bawahnya';
  }
}

wilayahRouter.get('/wilayah', async (req, res, next) => {
  try {
    const parent = typeof req.query.parent === 'string' ? req.query.parent : undefined;
    const result = await getChildren(pool, parent);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

wilayahRouter.get('/wilayah/search', async (req, res, next) => {
  try {
    const levelRaw = Number(req.query.level);
    if (![1, 2, 3, 4].includes(levelRaw)) {
      res.status(400).json({ error: 'level harus bernilai 1, 2, 3, atau 4' });
      return;
    }
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) {
      res.status(400).json({ error: 'q wajib diisi' });
      return;
    }
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 20;

    const result = await searchWilayah(pool, levelRaw as WilayahLevel, q, limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

wilayahRouter.post('/wilayah', requireApiKey, async (req, res, next) => {
  try {
    const kode = typeof req.body?.kode === 'string' ? req.body.kode.trim() : '';
    const nama = typeof req.body?.nama === 'string' ? req.body.nama.trim() : '';
    if (!nama) {
      res.status(400).json({ error: 'nama wajib diisi' });
      return;
    }
    const result = await createWilayah(pool, { kode, nama });
    if (!result.ok) {
      res
        .status(mutationErrorStatus(result.error))
        .json({ error: mutationErrorMessage(result.error) });
      return;
    }
    res.status(201).json(result.data);
  } catch (err) {
    next(err);
  }
});

wilayahRouter.patch('/wilayah/:kode', requireApiKey, async (req, res, next) => {
  try {
    const nama = typeof req.body?.nama === 'string' ? req.body.nama.trim() : '';
    if (!nama) {
      res.status(400).json({ error: 'nama wajib diisi' });
      return;
    }
    const result = await updateWilayahNama(pool, String(req.params.kode), nama);
    if (!result.ok) {
      res
        .status(mutationErrorStatus(result.error))
        .json({ error: mutationErrorMessage(result.error) });
      return;
    }
    res.json(result.data);
  } catch (err) {
    next(err);
  }
});

wilayahRouter.delete('/wilayah/:kode', requireApiKey, async (req, res, next) => {
  try {
    const result = await deleteWilayah(pool, String(req.params.kode));
    if (!result.ok) {
      res
        .status(mutationErrorStatus(result.error))
        .json({ error: mutationErrorMessage(result.error) });
      return;
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
