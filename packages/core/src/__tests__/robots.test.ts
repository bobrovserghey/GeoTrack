import { describe, it, expect } from 'vitest';
import { parseRobotsPermissions, AI_BOTS } from '../checks/robots.js';

const ALLOW_ALL = 'User-agent: *\nDisallow:\n';
const BLOCK_ALL = 'User-agent: *\nDisallow: /\n';
const BLOCK_GPTBOT = 'User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow:\n';
const ALLOW_GPTBOT_BLOCK_REST = 'User-agent: GPTBot\nAllow: /\n\nUser-agent: *\nDisallow: /\n';
const MALFORMED = 'this is not valid robots\nno directives at all\n';

describe('parseRobotsPermissions', () => {
  it('empty robots.txt → all bots not-specified', () => {
    const perms = parseRobotsPermissions('');
    for (const bot of AI_BOTS) {
      expect(perms[bot]).toBe('not-specified');
    }
  });

  it('Disallow: / for wildcard → all bots blocked', () => {
    const perms = parseRobotsPermissions(BLOCK_ALL);
    for (const bot of AI_BOTS) {
      expect(perms[bot]).toBe('blocked');
    }
  });

  it('Disallow: empty (allow all) → all bots allowed', () => {
    const perms = parseRobotsPermissions(ALLOW_ALL);
    for (const bot of AI_BOTS) {
      expect(perms[bot]).toBe('allowed');
    }
  });

  it('specific GPTBot block overrides wildcard allow', () => {
    const perms = parseRobotsPermissions(BLOCK_GPTBOT);
    expect(perms['GPTBot']).toBe('blocked');
    expect(perms['ClaudeBot']).toBe('allowed');
    expect(perms['PerplexityBot']).toBe('allowed');
  });

  it('specific GPTBot allow overrides wildcard block', () => {
    const perms = parseRobotsPermissions(ALLOW_GPTBOT_BLOCK_REST);
    expect(perms['GPTBot']).toBe('allowed');
    expect(perms['ClaudeBot']).toBe('blocked');
    expect(perms['Bingbot']).toBe('blocked');
  });

  it('malformed robots.txt → all bots not-specified', () => {
    const perms = parseRobotsPermissions(MALFORMED);
    for (const bot of AI_BOTS) {
      expect(perms[bot]).toBe('not-specified');
    }
  });

  it('block only ClaudeBot and Claude-User, allow rest', () => {
    const txt = [
      'User-agent: ClaudeBot',
      'Disallow: /',
      '',
      'User-agent: Claude-User',
      'Disallow: /',
      '',
      'User-agent: *',
      'Disallow:',
    ].join('\n');
    const perms = parseRobotsPermissions(txt);
    expect(perms['ClaudeBot']).toBe('blocked');
    expect(perms['Claude-User']).toBe('blocked');
    expect(perms['GPTBot']).toBe('allowed');
    expect(perms['PerplexityBot']).toBe('allowed');
    expect(perms['Bingbot']).toBe('allowed');
  });

  it('block all AI bots individually', () => {
    const lines = AI_BOTS.flatMap((bot) => [`User-agent: ${bot}`, 'Disallow: /', '']);
    const perms = parseRobotsPermissions(lines.join('\n'));
    for (const bot of AI_BOTS) {
      expect(perms[bot], `${bot} should be blocked`).toBe('blocked');
    }
  });

  it('returns all 8 AI bots in the result', () => {
    const perms = parseRobotsPermissions(BLOCK_ALL);
    const keys = Object.keys(perms);
    expect(keys).toHaveLength(AI_BOTS.length);
    for (const bot of AI_BOTS) {
      expect(keys).toContain(bot);
    }
  });

  it('partial path disallow does not block root', () => {
    const txt = 'User-agent: *\nDisallow: /admin\n';
    const perms = parseRobotsPermissions(txt, '/');
    for (const bot of AI_BOTS) {
      expect(perms[bot]).toBe('allowed');
    }
  });

  it('partial path disallow blocks that path', () => {
    const txt = 'User-agent: *\nDisallow: /admin\n';
    const perms = parseRobotsPermissions(txt, '/admin/panel');
    for (const bot of AI_BOTS) {
      expect(perms[bot]).toBe('blocked');
    }
  });

  it('comments in robots.txt are ignored', () => {
    const txt = [
      '# GeoTrack robots.txt',
      'User-agent: * # all bots',
      'Disallow: / # block everything',
    ].join('\n');
    const perms = parseRobotsPermissions(txt);
    for (const bot of AI_BOTS) {
      expect(perms[bot]).toBe('blocked');
    }
  });

  it('missing robots.txt (empty string) → all not-specified', () => {
    const perms = parseRobotsPermissions('');
    for (const bot of AI_BOTS) {
      expect(perms[bot]).toBe('not-specified');
    }
  });
});
