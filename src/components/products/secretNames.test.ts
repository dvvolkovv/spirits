import { describe, it, expect } from 'vitest';
import {
  EXTRA_SECRETS_MAX,
  extraSecretsPayload,
  isReservedSecretName,
  validateExtraSecrets,
} from './secretNames';

// Списки — те же, что в тестах сервера (provisioning.create.spec.ts) и агента
// хоста (provision.spec.ts). Копия проверки обязана совпадать с оригиналом в
// обе стороны: строже — отбивает законный ключ без причины, мягче — отказ
// приходит только после «Создать», русским текстом сервера.
describe('isReservedSecretName — та же проверка, что у сервера и агента хоста', () => {
  it.each([
    'LINKEON_URL', 'RUNNER_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'PRODUCT_START_SCRIPT', 'CHECKOUT_PATH',
    'CLAUDE_BIN', 'PORT', 'HOME', 'PATH', 'NODE_OPTIONS', 'SHELL', 'USER', 'BASH_ENV', 'ENV',
    'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'https_proxy', 'ANTHROPIC_BASE_URL',
    'CLAUDE_CONFIG_DIR', 'NODE_TLS_REJECT_UNAUTHORIZED', 'npm_config_registry', 'LD_PRELOAD',
    'GIT_SSH_COMMAND', 'PM2_HOME', 'SSL_CERT_FILE', 'port',
  ])('%s занято', (name) => {
    expect(isReservedSecretName(name)).toBe(true);
  });

  it.each(['NODE_ENV', 'node_env', 'TZ', 'OZON_API_KEY', 'MY_ANTHROPIC_KEY', 'GITHUB_TOKEN', 'SSH_KEY', 'BOT_TOKEN'])(
    '%s свободно',
    (name) => {
      expect(isReservedSecretName(name)).toBe(false);
    },
  );
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
});

it('потолок формы — 63: вместе с BOT_TOKEN ровно потолок сервера', () => {
  expect(EXTRA_SECRETS_MAX).toBe(63);
});
