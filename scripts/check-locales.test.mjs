import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SUPPORTED_CODES } from '../src/i18n/languages';

const here = dirname(fileURLToPath(import.meta.url));

describe('check-locales', () => {
  it('дублированный список языков совпадает с реестром', () => {
    const src = readFileSync(join(here, 'check-locales.mjs'), 'utf8');
    const match = src.match(/const SUPPORTED_CODES = \[([^\]]+)\]/);
    expect(match).not.toBeNull();
    const duplicated = match[1]
      .split(',')
      .map((s) => s.trim().replace(/^'|'$/g, ''))
      .filter(Boolean);
    expect(duplicated).toEqual(SUPPORTED_CODES);
  });
});
