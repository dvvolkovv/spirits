import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const languages = ['ru', 'en', 'es', 'de', 'fr', 'pt', 'zh'];
const privacyKeys = ['title', 'subtitle', 'automatic_profiling', 'automatic_profiling_description', 'discoverable', 'discoverable_description', 'loading', 'load_error', 'retry', 'save_error'];

describe('privacy locale coverage', () => {
  it.each(languages)('%s has every new string', (language) => {
    const locale = JSON.parse(fs.readFileSync(new URL(`./locales/${language}.json`, import.meta.url), 'utf8'));
    for (const key of privacyKeys) expect(locale.settings.privacy_controls[key]).toBeTruthy();
    expect(locale.compatibility.error_profile_not_available).toBeTruthy();
    expect(locale.compatibility.error_profile_data_unavailable).toBeTruthy();
  });
});

it('replaces all three local-only controls', () => {
  const source = fs.readFileSync(new URL('../components/settings/SettingsView.tsx', import.meta.url), 'utf8');
  expect(source).toContain('<PrivacySettings />');
  for (const key of ['profileVisibility', 'valuesVisibility', 'allowChats']) expect(source).not.toContain(key);
});
