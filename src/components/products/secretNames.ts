/**
 * Дополнительные ключи бота: форма имени и занятые имена.
 *
 * ТРЕТЬЯ КОПИЯ ОДНОЙ ПРОВЕРКИ. Оригинал — `isReservedEnvName` в агенте хоста
 * (`spirits_back/product-runner/src/host/provision.ts`), там же объяснение
 * каждого имени: это последний рубеж перед `docker run -e`. Вторая —
 * `isReservedSecretName` на сервере (`spirits_back/src/products/provisioning.service.ts`),
 * она отвечает 400 до записи продукта. Эта — ради объяснения на месте и на
 * языке кабинета: отказ сервера приходит русским текстом на всех семи локалях.
 *
 * Разъехаться им нельзя. Строже сервера — отбивает законное имя без причины;
 * мягче — человек узнаёт об отказе только после «Создать».
 */

/** Форма имени переменной окружения — `SECRET_NAME_RE` сервера, символ в символ. */
export const SECRET_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** Потолки — из create() на бэкенде. */
export const SECRET_NAME_MAX = 64;
export const SECRET_VALUE_MAX = 8192;
/** 64 секрета на продукт — потолок сервера, и один из них BOT_TOKEN. */
export const EXTRA_SECRETS_MAX = 63;

const RESERVED = [
  'LINKEON_URL', 'RUNNER_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'PRODUCT_START_SCRIPT',
  'CHECKOUT_PATH', 'CLAUDE_BIN', 'PORT', 'HOME', 'PATH', 'NODE_OPTIONS',
  'SHELL', 'USER', 'BASH_ENV', 'ENV', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
  'POLL_INTERVAL_MS', 'TURN_TIMEOUT_MS', 'POLL_TIMEOUT_MS', 'REQUEST_TIMEOUT_MS',
];
const RESERVED_PREFIXES = ['ANTHROPIC_', 'CLAUDE_', 'NODE_', 'NPM_CONFIG_', 'LD_', 'GIT_', 'PM2_', 'SSL_', 'DOTENV_'];
const RESERVED_EXCEPTIONS = ['NODE_ENV'];

/** Без учёта регистра: `https_proxy` читают так же, как `HTTPS_PROXY`. */
export function isReservedSecretName(name: string): boolean {
  const upper = name.toUpperCase();
  if (RESERVED_EXCEPTIONS.includes(upper)) return false;
  return RESERVED.includes(upper) || RESERVED_PREFIXES.some((p) => upper.startsWith(p));
}

export interface ExtraSecretRow {
  name: string;
  value: string;
}

/** Ключи переводов, а не текст: правило проверяется без рендера, показывает его форма. */
export type ExtraSecretError = { name?: string; value?: string };

/**
 * Проверка строк блока «Дополнительные ключи», по ошибке на строку.
 *
 * Строка без имени и без значения — не ошибка: человек нажал «Добавить ключ» и
 * передумал, такую строку просто не отправляют. Повтор отмечается на второй
 * строке: в объекте `secrets` второй ключ молча перебил бы первый.
 */
export function validateExtraSecrets(rows: readonly ExtraSecretRow[]): ExtraSecretError[] {
  const seen = new Set<string>();
  return rows.map((row) => {
    const name = row.name.trim();
    const value = row.value.trim();
    const e: ExtraSecretError = {};
    if (!name && !value) return e;

    if (!name) e.name = 'products.new.errors.secretNameRequired';
    else if (!SECRET_NAME_RE.test(name)) e.name = 'products.new.errors.secretNameInvalid';
    else if (name.length > SECRET_NAME_MAX) e.name = 'products.new.errors.secretNameTooLong';
    // BOT_TOKEN — не занятое имя, а поле выше: в secrets строка блока перебила
    // бы настоящий токен.
    else if (name === 'BOT_TOKEN') e.name = 'products.new.errors.secretNameBotToken';
    else if (isReservedSecretName(name)) e.name = 'products.new.errors.secretNameReserved';
    else if (seen.has(name)) e.name = 'products.new.errors.secretNameDuplicate';
    if (name) seen.add(name);

    // Пустое значение сервер отбивает, и это правильно: переменная без
    // значения доезжает до контейнера, и бот читает её как «ключа нет».
    if (!value) e.value = 'products.new.errors.secretValueRequired';
    else if (value.length > SECRET_VALUE_MAX) e.value = 'products.new.errors.secretValueTooLong';
    return e;
  });
}

/**
 * Заполненные строки → часть `secrets`. Звать только после проверки без ошибок.
 *
 * Object.fromEntries, а не присваивание: `out['__proto__'] = '…'` своего ключа
 * не создаёт, а имя `__proto__` форму переменной проходит — ключ молча пропал
 * бы из запроса.
 */
export function extraSecretsPayload(rows: readonly ExtraSecretRow[]): Record<string, string> {
  return Object.fromEntries(
    rows
      .map((row) => [row.name.trim(), row.value.trim()] as const)
      .filter(([name, value]) => name && value),
  );
}
