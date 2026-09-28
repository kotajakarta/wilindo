import { describe, it, expect } from 'vitest';
import {
  cleanDomainInput,
  isValidDomainFormat,
  extractHostname,
  isHostnameAllowed,
} from './allowed-domain.service';

describe('allowed-domain helper logic', () => {
  describe('cleanDomainInput', () => {
    it('membersihkan protokol http dan https', () => {
      expect(cleanDomainInput('https://tokosaya.com')).toBe('tokosaya.com');
      expect(cleanDomainInput('http://tokosaya.com')).toBe('tokosaya.com');
      expect(cleanDomainInput('//tokosaya.com')).toBe('tokosaya.com');
    });

    it('membersihkan port dan path', () => {
      expect(cleanDomainInput('https://TokoSaya.Com:8080/api/v1?test=1')).toBe('tokosaya.com');
      expect(cleanDomainInput('mitra.co.id:3000/')).toBe('mitra.co.id');
    });

    it('membersihkan wildcard prefix (*.)', () => {
      expect(cleanDomainInput('*.tokoku.id')).toBe('tokoku.id');
    });

    it('menangani whitespace dan huruf besar', () => {
      expect(cleanDomainInput('   EXAMPLE.ORG   ')).toBe('example.org');
    });
  });

  describe('isValidDomainFormat', () => {
    it('menerima format domain valid', () => {
      expect(isValidDomainFormat('tokosaya.com')).toBe(true);
      expect(isValidDomainFormat('mitra.co.id')).toBe(true);
      expect(isValidDomainFormat('sub.domain.sch.id')).toBe(true);
      expect(isValidDomainFormat('my-store-123.com')).toBe(true);
      expect(isValidDomainFormat('localhost')).toBe(true);
    });

    it('menolak format tidak valid', () => {
      expect(isValidDomainFormat('')).toBe(false);
      expect(isValidDomainFormat('invalid domain')).toBe(false);
      expect(isValidDomainFormat('https://example.com')).toBe(false);
      expect(isValidDomainFormat('.example.com')).toBe(false);
      expect(isValidDomainFormat('justword')).toBe(false);
    });
  });

  describe('extractHostname', () => {
    it('mengambil hostname dari berbagai bentuk input', () => {
      expect(extractHostname('https://app.tokosaya.com:3000/path')).toBe('app.tokosaya.com');
      expect(extractHostname('http://sub.domain.co.id')).toBe('sub.domain.co.id');
      expect(extractHostname('admin.tokoku.com')).toBe('admin.tokoku.com');
    });
  });

  describe('isHostnameAllowed (Subdomain Auto-inclusion)', () => {
    const bases = ['tokosaya.com', 'mitra.co.id', 'nri.my.id'];

    it('mengizinkan domain utama yang persis sama (exact match)', () => {
      expect(isHostnameAllowed('tokosaya.com', bases)).toBe(true);
      expect(isHostnameAllowed('mitra.co.id', bases)).toBe(true);
      expect(isHostnameAllowed('nri.my.id', bases)).toBe(true);
    });

    it('mengizinkan subdomain level 1 secara otomatis', () => {
      expect(isHostnameAllowed('app.tokosaya.com', bases)).toBe(true);
      expect(isHostnameAllowed('api.mitra.co.id', bases)).toBe(true);
      expect(isHostnameAllowed('wil.nri.my.id', bases)).toBe(true);
    });

    it('mengizinkan subdomain bertingkat (multi-level) secara otomatis', () => {
      expect(isHostnameAllowed('admin.staging.tokosaya.com', bases)).toBe(true);
      expect(isHostnameAllowed('dev.service.api.mitra.co.id', bases)).toBe(true);
    });

    it('menolak domain yang memiliki prefix mirip tapi bukan subdomain', () => {
      expect(isHostnameAllowed('faketokosaya.com', bases)).toBe(false);
      expect(isHostnameAllowed('eviltokosaya.com', bases)).toBe(false);
      expect(isHostnameAllowed('notmitra.co.id', bases)).toBe(false);
    });

    it('menolak domain yang mencoba memasang domain valid sebagai prefix', () => {
      expect(isHostnameAllowed('tokosaya.com.hacker.id', bases)).toBe(false);
      expect(isHostnameAllowed('mitra.co.id.phishing.com', bases)).toBe(false);
    });

    it('menolak domain lain yang tidak terdaftar', () => {
      expect(isHostnameAllowed('google.com', bases)).toBe(false);
      expect(isHostnameAllowed('randomsite.org', bases)).toBe(false);
    });
  });
});
