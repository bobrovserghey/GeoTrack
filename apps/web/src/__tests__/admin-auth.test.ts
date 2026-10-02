import { describe, it, expect } from 'vitest';
import { safeNextPath, ADMIN_DEFAULT_PATH } from '../lib/admin-auth.js';

describe('safeNextPath', () => {
  it('keeps a normal internal path with its query string', () => {
    expect(safeNextPath('/admin/audits?status=needs_attention')).toBe(
      '/admin/audits?status=needs_attention',
    );
  });

  it('keeps a bare internal path', () => {
    expect(safeNextPath('/admin')).toBe('/admin');
    expect(safeNextPath('/admin/audits/abc#step-3')).toBe('/admin/audits/abc#step-3');
  });

  it('falls back when nothing was requested', () => {
    expect(safeNextPath(null)).toBe(ADMIN_DEFAULT_PATH);
    expect(safeNextPath(undefined)).toBe(ADMIN_DEFAULT_PATH);
    expect(safeNextPath('')).toBe(ADMIN_DEFAULT_PATH);
  });

  it('rejects absolute URLs', () => {
    expect(safeNextPath('https://evil.example/pwn')).toBe(ADMIN_DEFAULT_PATH);
    expect(safeNextPath('http://evil.example/pwn')).toBe(ADMIN_DEFAULT_PATH);
    expect(safeNextPath('HTTPS://evil.example')).toBe(ADMIN_DEFAULT_PATH);
  });

  it('rejects any other scheme form', () => {
    expect(safeNextPath('javascript:alert(1)')).toBe(ADMIN_DEFAULT_PATH);
    expect(safeNextPath('data:text/html,<script>alert(1)</script>')).toBe(ADMIN_DEFAULT_PATH);
    expect(safeNextPath('mailto:a@b.c')).toBe(ADMIN_DEFAULT_PATH);
    expect(safeNextPath('evil.example:8080/pwn')).toBe(ADMIN_DEFAULT_PATH);
  });

  it('rejects protocol-relative URLs', () => {
    expect(safeNextPath('//evil.example/pwn')).toBe(ADMIN_DEFAULT_PATH);
    expect(safeNextPath('///evil.example')).toBe(ADMIN_DEFAULT_PATH);
  });

  it('rejects backslash variants browsers treat as host-relative', () => {
    expect(safeNextPath('/\\evil.example')).toBe(ADMIN_DEFAULT_PATH);
    expect(safeNextPath('\\\\evil.example')).toBe(ADMIN_DEFAULT_PATH);
    expect(safeNextPath('\\/evil.example')).toBe(ADMIN_DEFAULT_PATH);
    expect(safeNextPath('/admin\\..\\..')).toBe(ADMIN_DEFAULT_PATH);
  });

  it('rejects control characters and whitespace that browsers strip before parsing', () => {
    expect(safeNextPath('/\t/evil.example')).toBe(ADMIN_DEFAULT_PATH);
    expect(safeNextPath('/\n/evil.example')).toBe(ADMIN_DEFAULT_PATH);
    expect(safeNextPath(' //evil.example')).toBe(ADMIN_DEFAULT_PATH);
  });

  it('rejects anything not starting with a slash', () => {
    expect(safeNextPath('admin/audits')).toBe(ADMIN_DEFAULT_PATH);
    expect(safeNextPath('../admin')).toBe(ADMIN_DEFAULT_PATH);
    expect(safeNextPath('evil.example')).toBe(ADMIN_DEFAULT_PATH);
  });
});
