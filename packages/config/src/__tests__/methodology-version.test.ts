import { describe, it, expect } from 'vitest';
import { getMethodology, getMethodologyByVersion } from '../index.js';

describe('getMethodologyByVersion', () => {
  it('returns a valid methodology for version "1"', () => {
    const m = getMethodologyByVersion('1');
    expect(m.version).toBe(1);
    expect(m.pillars).toBeDefined();
    expect(m.bands.length).toBeGreaterThan(0);
  });

  it('throws on an unknown version', () => {
    expect(() => getMethodologyByVersion('999')).toThrowError(/Unknown methodology version/);
  });

  it('error message lists known versions', () => {
    expect(() => getMethodologyByVersion('999')).toThrowError(/Known: 1/);
  });

  it('throws the same error for Object.prototype keys', () => {
    for (const key of ['toString', 'constructor', 'valueOf', 'hasOwnProperty', '__proto__']) {
      expect(() => getMethodologyByVersion(key)).toThrowError(/Unknown methodology version/);
    }
  });

  it('getMethodology() is equivalent to getMethodologyByVersion("1")', () => {
    expect(getMethodology()).toEqual(getMethodologyByVersion('1'));
  });
});
