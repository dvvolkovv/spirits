import { describe, it, expect } from 'vitest';
import {
  EXTRA_SECRETS_MAX,
  extraSecretsPayload,
  isReservedSecretName,
  validateExtraSecrets,
} from './secretNames';

// Копия проверки обязана совпадать с оригиналом в обе стороны: строже —
// отбивает законный ключ без причины, мягче — отказ приходит только после
// «Создать», русским текстом сервера.
//
// ОДНА ТАБЛИЦА НА ТРИ КОПИИ ПРОВЕРКИ: дословно та же стоит в
// spirits_back/product-runner/src/host/provision.spec.ts (агент хоста) и в
// spirits_back/src/products/provisioning.create.spec.ts (сервер). Она
// перечисляет КАЖДОЕ точное имя и по примеру на каждое семейство — имя,
// выпавшее из одной копии, не пройдёт незамеченным.
const RESERVED_TABLE = [
  // точные
  'LINKEON_URL', 'RUNNER_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'PRODUCT_START_SCRIPT', 'CHECKOUT_PATH',
  'CLAUDE_BIN', 'PORT', 'HOME', 'PATH', 'NODE_OPTIONS', 'SHELL', 'USER', 'BASH_ENV', 'ENV',
  'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
  'POLL_INTERVAL_MS', 'TURN_TIMEOUT_MS', 'POLL_TIMEOUT_MS', 'REQUEST_TIMEOUT_MS',
  'OWNER_TG_ID',
  // семейства
  'ANTHROPIC_BASE_URL', 'CLAUDE_CONFIG_DIR', 'NODE_TLS_REJECT_UNAUTHORIZED', 'NPM_CONFIG_REGISTRY',
  'LD_PRELOAD', 'GIT_SSH_COMMAND', 'PM2_HOME', 'SSL_CERT_FILE', 'DOTENV_CONFIG_PATH',
  // регистр не спасает
  'https_proxy', 'port', 'npm_config_registry', 'dotenv_key',
];
const ALLOWED_TABLE = [
  'NODE_ENV', 'node_env', 'TZ', 'OZON_API_KEY', 'MY_ANTHROPIC_KEY', 'GITHUB_TOKEN', 'NODEJS_VERSION',
  'POLL_INTERVAL', 'SSH_KEY', 'BOT_TOKEN',
];

describe('isReservedSecretName — та же проверка, что у сервера и агента хоста', () => {
  it.each(RESERVED_TABLE)('%s занято', (name) => {
    expect(isReservedSecretName(name)).toBe(true);
  });

  it.each(ALLOWED_TABLE)('%s свободно', (name) => {
    expect(isReservedSecretName(name)).toBe(false);
  });
});

describe('validateExtraSecrets', () => {
  const E = 'products.new.errors.';

  it('строка без имени и значения — не ошибка: её просто не отправят', () => {
    expect(validateExtraSecrets([{ name: '  ', value: '' }])).toEqual([{}]);
  });

  it('годная строка проходит', () => {
    expect(validateExtraSecrets([{ name: 'OZON_API_KEY', value: 'k' }])).toEqual([{}]);
  });

  it.each([
    [{ name: '', value: 'k' }, { name: `${E}secretNameRequired` }],
    [{ name: 'A_KEY', value: ' ' }, { value: `${E}secretValueRequired` }],
    [{ name: '1KEY', value: 'k' }, { name: `${E}secretNameInvalid` }],
    [{ name: 'OZON KEY', value: 'k' }, { name: `${E}secretNameInvalid` }],
    [{ name: 'К_КЛЮЧ', value: 'k' }, { name: `${E}secretNameInvalid` }],
    [{ name: 'K'.repeat(65), value: 'k' }, { name: `${E}secretNameTooLong` }],
    [{ name: 'BOT_TOKEN', value: 'k' }, { name: `${E}secretNameBotToken` }],
    [{ name: 'ANTHROPIC_BASE_URL', value: 'k' }, { name: `${E}secretNameReserved` }],
    [{ name: 'A_KEY', value: 'ы'.repeat(8193) }, { value: `${E}secretValueTooLong` }],
  ])('%j → %j', (row, want) => {
    expect(validateExtraSecrets([row])).toEqual([want]);
  });

  it('64 символа в имени и 8192 в значении — ещё можно', () => {
    expect(validateExtraSecrets([{ name: 'K'.repeat(64), value: 'ы'.repeat(8192) }])).toEqual([{}]);
  });

  it('повтор имени отмечается на второй строке, первая чиста', () => {
    // В объекте secrets второй ключ с тем же именем молча перебил бы первый.
    expect(
      validateExtraSecrets([
        { name: 'A_KEY', value: 'a' },
        { name: ' A_KEY ', value: 'b' },
      ]),
    ).toEqual([{}, { name: `${E}secretNameDuplicate` }]);
  });
});

describe('extraSecretsPayload', () => {
  it('обрезает края и пропускает пустые строки', () => {
    expect(
      extraSecretsPayload([
        { name: ' A_KEY ', value: ' a ' },
        { name: '', value: '' },
      ]),
    ).toEqual({ A_KEY: 'a' });
  });

  it('имя __proto__ доезжает своим ключом, а не теряется в прототипе', () => {
    // Форму переменной оно проходит, а присваивание out['__proto__'] = '…'
    // в обычный объект ключа не создаёт — ключ молча пропал бы из запроса.
    const payload = extraSecretsPayload([{ name: '__proto__', value: 'p' }]);
    expect(Object.keys(payload)).toEqual(['__proto__']);
    expect(JSON.parse(JSON.stringify({ ...payload, BOT_TOKEN: 't' }))).toEqual(
      JSON.parse('{"__proto__":"p","BOT_TOKEN":"t"}'),
    );
  });
});

it('потолок формы — 63: вместе с BOT_TOKEN ровно потолок сервера', () => {
  expect(EXTRA_SECRETS_MAX).toBe(63);
});
