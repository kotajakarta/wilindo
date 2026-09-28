import type { Request, Response, NextFunction } from 'express';
import { extractHostname, isHostnameAllowed, initAllowedDomainsTable } from './allowed-domain.service';
import { isValidApiKey } from './auth';

// Pastikan tabel & cache domain terinisialisasi saat server mulai
initAllowedDomainsTable().catch(err => {
  console.error('Gagal inisialisasi tabel allowed_domains:', err);
});

/**
 * Middleware pengaman domain & CORS untuk semua rute /api
 * 1. Request dari browser (ada Origin):
 *    - Dicek apakah hostname origin ada di whitelist (subdomain otomatis diizinkan).
 *    - Jika cocok -> Set CORS header dan izinkan.
 *    - Jika tidak cocok -> 403 Forbidden.
 * 2. Request dari browser same-origin (tidak ada Origin tapi ada Referer/same-origin header):
 *    - Dicek apakah referer/host diizinkan -> Izinkan.
 * 3. Request langsung tanpa browser (cURL, Postman, backend script, bot):
 *    - Mode Ketat (Strict): Wajib menyertakan X-API-Key yang valid.
 *    - Jika ada API Key valid -> Izinkan.
 *    - Jika tidak ada / salah -> 401 Unauthorized.
 */
export function domainSecurityGuard(req: Request, res: Response, next: NextFunction) {
  // Selalu izinkan health check endpoint internal
  if (req.path === '/health' || req.path === '/api/health') {
    return next();
  }

  const originHeader = req.header('Origin');

  // Handle CORS OPTIONS preflight request
  if (req.method === 'OPTIONS') {
    if (originHeader) {
      const hostname = extractHostname(originHeader);
      if (isHostnameAllowed(hostname)) {
        res.setHeader('Access-Control-Allow-Origin', originHeader);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Authorization');
        res.setHeader('Access-Control-Max-Age', '86400');
        res.status(204).end();
        return;
      }
    }
    // Jika options dari origin tidak dikenal
    res.status(403).json({ error: 'Akses ditolak: domain origin tidak diizinkan' });
    return;
  }

  // 1. Request memiliki header Origin (pasti dari browser cross-origin atau POST/PATCH)
  if (originHeader) {
    const hostname = extractHostname(originHeader);
    if (isHostnameAllowed(hostname)) {
      res.setHeader('Access-Control-Allow-Origin', originHeader);
      res.setHeader('Vary', 'Origin');
      return next();
    }
    res.status(403).json({
      error: `Akses ditolak: origin (${originHeader}) tidak terdaftar dalam whitelist domain Wilindo`,
    });
    return;
  }

  // 2. Request browser same-origin (GET browser biasanya tidak menyertakan Origin, tapi menyertakan Referer)
  const refererHeader = req.header('Referer');
  if (refererHeader) {
    const refererHost = extractHostname(refererHeader);
    if (isHostnameAllowed(refererHost)) {
      return next();
    }
  }

  // Cek sec-fetch-site same-origin dengan host terdaftar
  const secFetchSite = req.header('sec-fetch-site');
  if (secFetchSite === 'same-origin' || secFetchSite === 'same-site') {
    const hostHeader = req.header('Host') || '';
    if (isHostnameAllowed(extractHostname(hostHeader))) {
      return next();
    }
  }

  // 3. Request langsung tanpa browser (cURL, Postman, backend service, curl script)
  // Sesuai mode Ketat (Strict): Wajib menyertakan X-API-Key
  const apiKey = req.header('X-API-Key');
  if (apiKey && isValidApiKey(apiKey)) {
    return next();
  }

  res.status(401).json({
    error: 'Akses ditolak: request langsung tanpa browser origin wajib menyertakan X-API-Key yang valid di header',
  });
}
