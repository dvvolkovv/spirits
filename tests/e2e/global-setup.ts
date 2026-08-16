import { FullConfig, chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { loginViaApi } from './helpers/login';
import { TEST_PHONES, BASE_URL, AUTH_STATE_PATH } from './helpers/testData';

export default async function globalSetup(_config: FullConfig) {
  await saveAuthState(TEST_PHONES.USER, AUTH_STATE_PATH.USER);
  await saveAuthState(TEST_PHONES.ADMIN, AUTH_STATE_PATH.ADMIN);
}

async function saveAuthState(phone: string, outPath: string): Promise<void> {
  if (fs.existsSync(outPath)) {
    const ageSec = (Date.now() - fs.statSync(outPath).mtimeMs) / 1000;
    // Кеш привязан к origin: localStorage у localhost и у прода — разные хранилища,
    // и состояние от прошлого прогона против другого адреса даёт неотличимый от
    // «протух токен» разлогин.
    const cachedOrigin = (() => {
      try {
        const state = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
        return state.origins?.[0]?.origin as string | undefined;
      } catch {
        return undefined;
      }
    })();
    if (ageSec < 3600 && cachedOrigin === new URL(BASE_URL).origin) {
      console.log(`[globalSetup] reusing cached auth for ${phone} (${Math.round(ageSec)}s old)`);
      return;
    }
  }

  const { accessToken, refreshToken, userData } = await loginViaApi(phone);

  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE_URL);

  await page.evaluate(
    ({ accessToken, refreshToken, userData }) => {
      localStorage.setItem('jwt_access_token', accessToken);
      localStorage.setItem('jwt_refresh_token', refreshToken);
      // legacy-совместимость: AuthContext.initAuth читает оба
      localStorage.setItem('authToken', accessToken);
      localStorage.setItem('userData', JSON.stringify(userData));
    },
    { accessToken, refreshToken, userData },
  );

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await ctx.storageState({ path: outPath });
  await browser.close();

  console.log(`[globalSetup] saved auth state for ${phone} → ${outPath}`);
}
