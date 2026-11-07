// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const AUTOMATIC = 'settings.privacy_controls.automatic_profiling';
const DISCOVERABLE = 'settings.privacy_controls.discoverable';
const root = fileURLToPath(new URL('../../../', import.meta.url));

let browser: Browser;
let bundle: string;

beforeAll(async () => {
  // jsdom не реализует browser default action: KeyboardEvent на <button> сам
  // не создаёт click. Здесь компонент монтируется в настоящий Chromium, а
  // Playwright отправляет настоящие клавиатурные события, не вызывая click().
  const result = await build({
    stdin: {
      contents: `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import PrivacySettings from './src/components/settings/PrivacySettings';
        createRoot(document.getElementById('root')!).render(React.createElement(PrivacySettings));
      `,
      resolveDir: root,
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    define: { 'import.meta.env.VITE_BACKEND_URL': '""' },
    plugins: [{
      name: 'offline-harness',
      setup(builder) {
        builder.onResolve({ filter: /^\.\.\/\.\.\/services\/apiClient$/ }, () => ({ path: 'apiClient', namespace: 'offline-api' }));
        builder.onLoad({ filter: /.*/, namespace: 'offline-api' }, () => ({
          contents: `
            export const apiClient = {
              get: (url) => fetch(url),
              post: (url, data) => fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
              }),
            };
          `,
          loader: 'js',
        }));
        builder.onResolve({ filter: /^react-i18next$/ }, () => ({ path: 'react-i18next', namespace: 'offline-i18n' }));
        builder.onLoad({ filter: /.*/, namespace: 'offline-i18n' }, () => ({
          contents: 'export const useTranslation = () => ({ t: (key) => key });',
          loader: 'js',
        }));
      },
    }],
  });
  bundle = result.outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
}, 30_000);

afterAll(async () => {
  await browser?.close();
});

async function openOffline(page: Page, posts: Array<Record<string, boolean>>) {
  let settings = { automaticProfiling: true, discoverable: true };

  // Весь документ и API обслуживаются route handler. Любой другой URL,
  // включая случайный внешний backend, запрещён и не уйдёт в сеть.
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== 'http://privacy.test') return route.abort();
    if (url.pathname === '/') {
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"></head><body><div id="root"></div></body></html>',
      });
    }
    if (url.pathname !== '/webhook/privacy-settings') return route.abort();
    if (request.method() === 'GET') return route.fulfill({ json: settings });
    if (request.method() !== 'POST') return route.abort();
    const body = request.postDataJSON() as Record<string, boolean>;
    posts.push(body);
    settings = { ...settings, ...body };
    return route.fulfill({ json: settings });
  });

  await page.goto('http://privacy.test/');
  page.on('pageerror', (error) => console.error('offline browser pageerror:', error.message));
  await page.addScriptTag({ content: bundle });
  await page.getByRole('switch', { name: AUTOMATIC }).waitFor();
}

async function waitUntilSaved(page: Page, label: string) {
  await page.waitForFunction((accessibleName) => {
    const control = document.querySelector<HTMLButtonElement>(`[aria-label="${accessibleName}"]`);
    return control?.getAttribute('aria-checked') === 'false' && !control.disabled;
  }, label);
}

it('activates both native switches by keyboard with one POST each', async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(5_000);
  const posts: Array<Record<string, boolean>> = [];
  try {
    await openOffline(page, posts);
    const automatic = page.getByRole('switch', { name: AUTOMATIC });
    const discoverable = page.getByRole('switch', { name: DISCOVERABLE });
    expect(await automatic.getAttribute('aria-checked')).toBe('true');
    expect(await discoverable.getAttribute('aria-checked')).toBe('true');

    await page.keyboard.press('Tab');
    expect(await automatic.evaluate((control) => control === document.activeElement)).toBe(true);
    await page.keyboard.press('Enter');
    await waitUntilSaved(page, AUTOMATIC);
    expect(posts).toEqual([{ automaticProfiling: false }]);
    expect(await automatic.getAttribute('aria-checked')).toBe('false');

    await page.keyboard.press('Tab');
    expect(await discoverable.evaluate((control) => control === document.activeElement)).toBe(true);
    await page.keyboard.press('Space');
    await waitUntilSaved(page, DISCOVERABLE);
    expect(posts).toEqual([{ automaticProfiling: false }, { discoverable: false }]);
    expect(await automatic.getAttribute('aria-checked')).toBe('false');
    expect(await discoverable.getAttribute('aria-checked')).toBe('false');
    expect(await automatic.isDisabled()).toBe(false);
    expect(await discoverable.isDisabled()).toBe(false);
  } finally {
    await page.close();
  }
}, 30_000);
