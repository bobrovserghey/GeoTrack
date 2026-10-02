import { describe, it, expect } from 'vitest';
import { Degradations } from '../steps/degradations.js';

describe('Degradations', () => {
  it('is empty until something degrades', () => {
    const d = new Degradations();
    expect(d.isEmpty).toBe(true);
    expect(d.toNotes()).toEqual([]);
    d.push('B5: request failed');
    expect(d.isEmpty).toBe(false);
  });

  it('counts repeats instead of repeating them', () => {
    const d = new Degradations();
    for (let i = 0; i < 11; i++) d.push('probe skipped: host halted after 429');
    expect(d.toNotes()).toEqual(['degraded: probe skipped: host halted after 429 (x11)']);
  });

  it('keeps distinct reasons and their order', () => {
    const d = new Degradations();
    d.push('a');
    d.push('b');
    d.push('a');
    expect(d.toNotes()).toEqual(['degraded: a (x2)', 'degraded: b']);
  });

  it('caps distinct reasons and summarises the rest', () => {
    const d = new Degradations(3);
    for (let i = 0; i < 10; i++) d.push(`reason ${i}`);
    const notes = d.toNotes();
    expect(notes).toHaveLength(4);
    expect(notes.slice(0, 3)).toEqual(['degraded: reason 0', 'degraded: reason 1', 'degraded: reason 2']);
    expect(notes[3]).toBe('degraded: 7 further occurrences of 7 other reasons suppressed');
  });
});
