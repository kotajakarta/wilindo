import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { domainSecurityGuard } from './domain-guard.middleware';
import * as domainService from './allowed-domain.service';

describe('domainSecurityGuard middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let nextFn: NextFunction;
  let headers: Record<string, string>;
  let resHeaders: Record<string, string>;
  let statusCode = 200;
  let jsonResponse: any = null;

  beforeEach(() => {
    headers = {};
    resHeaders = {};
    statusCode = 200;
    jsonResponse = null;

    mockReq = {
      path: '/api/wilayah',
      method: 'GET',
      header: ((name: string) => headers[name.toLowerCase()]) as any,
    };

    mockRes = {
      setHeader: vi.fn((k: string, v: string) => {
        resHeaders[k.toLowerCase()] = v;
        return mockRes as Response;
      }),
      status: vi.fn((code: number) => {
        statusCode = code;
        return mockRes as Response;
      }),
      json: vi.fn((body: any) => {
        jsonResponse = body;
        return mockRes as Response;
      }),
      end: vi.fn(() => mockRes as Response),
    };

    nextFn = vi.fn();
  });

  it('selalu mengizinkan endpoint health check', () => {
    (mockReq as any).path = '/api/health';
    domainSecurityGuard(mockReq as Request, mockRes as Response, nextFn);
    expect(nextFn).toHaveBeenCalled();
  });

  it('mengizinkan browser dari origin terdaftar dan menyetel header CORS', () => {
    headers['origin'] = 'https://app.tokosaya.com';
    vi.spyOn(domainService, 'isHostnameAllowed').mockReturnValue(true);

    domainSecurityGuard(mockReq as Request, mockRes as Response, nextFn);

    expect(nextFn).toHaveBeenCalled();
    expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'https://app.tokosaya.com');
  });

  it('menolak browser dari origin yang tidak terdaftar (403)', () => {
    headers['origin'] = 'https://evilsite.com';
    vi.spyOn(domainService, 'isHostnameAllowed').mockReturnValue(false);

    domainSecurityGuard(mockReq as Request, mockRes as Response, nextFn);

    expect(nextFn).not.toHaveBeenCalled();
    expect(statusCode).toBe(403);
    expect(jsonResponse.error).toContain('tidak terdaftar');
  });

  it('menangani CORS preflight OPTIONS dengan benar jika origin diizinkan', () => {
    mockReq.method = 'OPTIONS';
    headers['origin'] = 'https://tokosaya.com';
    vi.spyOn(domainService, 'isHostnameAllowed').mockReturnValue(true);

    domainSecurityGuard(mockReq as Request, mockRes as Response, nextFn);

    expect(mockRes.status).toHaveBeenCalledWith(204);
    expect(mockRes.end).toHaveBeenCalled();
  });

  it('menolak CORS preflight OPTIONS jika origin tidak diizinkan', () => {
    mockReq.method = 'OPTIONS';
    headers['origin'] = 'https://evilsite.com';
    vi.spyOn(domainService, 'isHostnameAllowed').mockReturnValue(false);

    domainSecurityGuard(mockReq as Request, mockRes as Response, nextFn);

    expect(statusCode).toBe(403);
    expect(mockRes.end).not.toHaveBeenCalled();
  });

  it('mengizinkan request langsung (cURL/Postman) jika menyertakan X-API-Key yang valid', () => {
    // Tanpa origin atau referer
    headers['x-api-key'] = process.env.API_KEY || 'test-key';

    domainSecurityGuard(mockReq as Request, mockRes as Response, nextFn);

    expect(nextFn).toHaveBeenCalled();
  });

  it('menolak request langsung tanpa Origin dan tanpa X-API-Key (401)', () => {
    domainSecurityGuard(mockReq as Request, mockRes as Response, nextFn);

    expect(nextFn).not.toHaveBeenCalled();
    expect(statusCode).toBe(401);
    expect(jsonResponse.error).toContain('X-API-Key');
  });
});
