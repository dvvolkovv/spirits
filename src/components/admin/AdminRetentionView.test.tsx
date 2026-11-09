// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { byButton, clickAsync, flush, mount, visibleText, type Mounted } from '../../test/dom';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('../../services/apiClient', () => ({ apiClient: { post } }));

import AdminRetentionView from './AdminRetentionView';

const res = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const drafts = [
  {
    user_id: 'u-email', phone: '79001112233', email: 'person@example.com', channel: 'email',
    language: 'en', subject: 'Your Linkeon assistant', message: 'Hello', last_at: '2026-11-05',
    days_inactive: 3, last_sent_at: null, in_cooldown: false,
  },
  {
    user_id: 'u-sms', phone: '79001112244', email: null, channel: 'sms',
    language: 'ru', subject: null, message: 'SMS text', last_at: '2026-11-05',
    days_inactive: 3, last_sent_at: null, in_cooldown: false,
  },
  {
    user_id: 'u-none', phone: null, email: null, channel: 'no_channel',
    language: 'ru', subject: null, message: '', last_at: '2026-11-05',
    days_inactive: 3, last_sent_at: null, in_cooldown: false,
  },
  {
    user_id: 'u-paused', phone: null, email: 'paused@example.com', channel: 'email',
    language: 'ru', subject: 'Пауза', message: 'Paused', last_at: '2026-11-05',
    days_inactive: 3, last_sent_at: '2026-11-07', in_cooldown: true,
  },
];
const preview = {
  channel: 'mixed', campaign: 'retention_reengage_v1', window: { min_days: 2, max_days: 30 },
  cooldown_days: 14, count: 4,
  summary: { email: 2, sms: 1, no_channel: 1, skipped_unsubscribed: 1 }, drafts,
};
const sendResult = {
  campaign: 'retention_reengage_v1', sent: 2, sent_email: 1, sent_sms: 1,
  failed: 0, skipped_cooldown: 1, skipped_unsubscribed: 0, no_channel: 1,
  results: [],
};

let m: Mounted | undefined;
const settle = async () => { for (let i = 0; i < 5; i += 1) await flush(); };

beforeEach(() => {
  post.mockReset();
  post.mockImplementation(async (_url: string, body: any) => {
    if (body.action === 'preview' || body.action === 'curious_preview') return res(preview);
    if (body.action === 'send' || body.action === 'curious_send') return res(sendResult);
    throw new Error(`unexpected action ${body.action}`);
  });
});

afterEach(() => {
  m?.unmount();
  m = undefined;
  vi.restoreAllMocks();
});

describe('AdminRetentionView mixed channels', () => {
  it('показывает email, SMS, язык, тему и запрещает no_channel', async () => {
    m = mount(<AdminRetentionView />);
    await settle();
    const text = visibleText(m.container);
    expect(text).toContain('person@example.com');
    expect(text).toContain('Your Linkeon assistant');
    expect(text).toContain('79001112244');
    expect(text).toContain('нет канала');
    const emailRow = visibleText(m.container.querySelector<HTMLElement>('[data-testid="retention-row-u-email"]')!);
    expect(emailRow).toContain('email');
    expect(emailRow).toContain('· en');
    const smsRow = visibleText(m.container.querySelector<HTMLElement>('[data-testid="retention-row-u-sms"]')!);
    expect(smsRow).toContain('sms');
    expect(smsRow).toContain('· ru');
    const noChannelRow = visibleText(m.container.querySelector<HTMLElement>('[data-testid="retention-row-u-none"]')!);
    expect(noChannelRow).toContain('u-none');
    expect((m.container.querySelector('[data-testid="retention-send-u-none"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('bulk confirmation исключает cooldown/no_channel и показывает каналы отдельно', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    m = mount(<AdminRetentionView />);
    await settle();
    await clickAsync(byButton(m.container, /Отправить всем/)!);
    expect(confirm.mock.calls[0][0]).toContain('1 email');
    expect(confirm.mock.calls[0][0]).toContain('1 SMS');
    expect(post.mock.calls.filter(([, body]) => body.action === 'send')).toHaveLength(0);
  });

  it('одиночная отправка использует userIds и не передаёт phones', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    m = mount(<AdminRetentionView />);
    await settle();
    await clickAsync(m.container.querySelector('[data-testid="retention-send-u-email"]')!);
    await settle();
    const call = post.mock.calls.find(([, body]) => body.action === 'send');
    expect(call?.[1]).toEqual({
      action: 'send', confirm: true, userIds: ['u-email'], resend: false, minDays: 2, maxDays: 30,
    });
    expect(call?.[1]).not.toHaveProperty('phones');
  });

  it('результат содержит счётчики каналов и ошибку учёта', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    post.mockImplementation(async (_url: string, body: any) => {
      if (body.action === 'preview') return res(preview);
      if (body.action === 'send') return res({
        ...sendResult,
        results: [{ user_id: 'u-email', phone: null, email: 'person@example.com', channel: 'email', status: 'sent', error: null, log_error: true }],
      });
      throw new Error(`unexpected action ${body.action}`);
    });
    m = mount(<AdminRetentionView />);
    await settle();
    await clickAsync(byButton(m.container, /Отправить всем/)!);
    await settle();
    const text = visibleText(m.container);
    expect(text).toContain('Отправлено: 2');
    expect(text).toContain('Email: 1');
    expect(text).toContain('SMS: 1');
    expect(text).toContain('ошибок: 0');
    expect(text).toContain('пауза: 1');
    expect(text).toContain('отписка: 0');
    expect(text).toContain('нет канала: 1');
    expect(text).toContain('без записи cooldown: 1');
    expect(post.mock.calls.filter(([, body]) => body.action === 'preview')).toHaveLength(2);
    await clickAsync(byButton(m.container, /^Обновить$/)!);
    await settle();
    const refreshedText = visibleText(m.container);
    expect(refreshedText).not.toContain('Отправлено: 2');
    expect(refreshedText).not.toContain('без записи cooldown');
    expect(post.mock.calls.filter(([, body]) => body.action === 'preview')).toHaveLength(3);
  });

  it('ошибка preview очищает старый сегмент и блокирует отправку', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    post.mockImplementation(async (_url: string, body: any) => {
      if (body.action === 'preview') return res(preview);
      if (body.action === 'curious_preview') return res({ message: 'Curious unavailable' }, 500);
      if (body.action === 'curious_send') return res(sendResult);
      throw new Error(`unexpected action ${body.action}`);
    });
    m = mount(<AdminRetentionView />);
    await settle();
    expect(visibleText(m.container)).toContain('person@example.com');
    await clickAsync(byButton(m.container, /^Новые 24–48 ч$/)!);
    await settle();

    const text = visibleText(m.container);
    expect(text).toContain('Ошибка: 500');
    expect(text).not.toContain('person@example.com');
    const bulk = byButton(m.container, /Отправить всем/);
    const single = m.container.querySelector<HTMLButtonElement>('[data-testid="retention-send-u-email"]');
    expect(bulk === null || bulk.disabled).toBe(true);
    expect(single === null || single.disabled).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(post.mock.calls.filter(([, body]) => body.action === 'curious_send')).toHaveLength(0);
  });

  it('не отправляет старый preview во время смены режима', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const deferred = () => {
      let resolve!: (value: ReturnType<typeof res>) => void;
      const promise = new Promise<ReturnType<typeof res>>((r) => { resolve = r; });
      return { promise, resolve };
    };
    const firstCuriousPreview = deferred();
    const reloadCuriousPreview = deferred();
    const pendingCuriousSend = deferred();
    const curiousPreview = {
      ...preview,
      window: { min_hours: 24, max_hours: 48 },
      count: 1,
      summary: { email: 1, sms: 0, no_channel: 0, skipped_unsubscribed: 0 },
      drafts: [{
        user_id: 'u-curious', phone: null, email: 'curious@example.com', channel: 'email',
        language: 'ru', subject: 'Curious subject', message: 'Curious message', last_at: '2026-11-08',
        hours_inactive: 36, last_sent_at: null, in_cooldown: false,
      }],
    };
    let curiousPreviewCalls = 0;
    post.mockImplementation(async (_url: string, body: any) => {
      if (body.action === 'preview') return res(preview);
      if (body.action === 'curious_preview') {
        curiousPreviewCalls += 1;
        return (curiousPreviewCalls === 1 ? firstCuriousPreview : reloadCuriousPreview).promise;
      }
      if (body.action === 'curious_send') return pendingCuriousSend.promise;
      throw new Error(`unexpected action ${body.action}`);
    });

    m = mount(<AdminRetentionView />);
    await settle();
    await clickAsync(byButton(m.container, /^Новые 24–48 ч$/)!);
    await flush();

    const bulk = byButton(m.container, /Отправить всем/)!;
    const oldSingles = ['u-email', 'u-sms', 'u-paused'].map((id) =>
      m!.container.querySelector<HTMLButtonElement>(`[data-testid="retention-send-${id}"]`)!,
    );
    expect(bulk.disabled).toBe(true);
    oldSingles.forEach((button) => expect(button.disabled).toBe(true));
    expect(byButton(m.container, /^Общий$/)!.disabled).toBe(true);
    expect(byButton(m.container, /^Обновить$/)!.disabled).toBe(true);
    await clickAsync(bulk);
    for (const button of oldSingles) await clickAsync(button);
    await settle();
    expect(confirm).not.toHaveBeenCalled();
    expect(post.mock.calls.filter(([, body]) => body.action === 'curious_send')).toHaveLength(0);

    firstCuriousPreview.resolve(res(curiousPreview));
    await settle();
    expect(visibleText(m.container)).toContain('curious@example.com');
    await clickAsync(byButton(m.container, /Отправить всем/)!);
    await flush();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toContain('1 email');
    expect(confirm.mock.calls[0][0]).toContain('0 SMS');
    const sendCall = post.mock.calls.find(([, body]) => body.action === 'curious_send');
    expect(sendCall?.[1]).toEqual({ action: 'curious_send', confirm: true, resend: false });
    expect(sendCall?.[1]).not.toHaveProperty('userIds');
    expect(byButton(m.container, /^Общий$/)!.disabled).toBe(true);
    expect(byButton(m.container, /^Новые 24–48 ч$/)!.disabled).toBe(true);
    expect(byButton(m.container, /^Обновить$/)!.disabled).toBe(true);

    pendingCuriousSend.resolve(res(sendResult));
    await settle();
    expect(curiousPreviewCalls).toBe(2);
    reloadCuriousPreview.resolve(res(curiousPreview));
    await settle();
    expect(byButton(m.container, /^Общий$/)!.disabled).toBe(false);
    expect(visibleText(m.container)).toContain('curious@example.com');
  });

  it('Curious продолжает использовать curious_preview и curious_send', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    m = mount(<AdminRetentionView />);
    await settle();
    await clickAsync(byButton(m.container, /^Новые 24–48 ч$/)!);
    await settle();
    expect(post.mock.calls.some(([, body]) => body.action === 'curious_preview')).toBe(true);
    await clickAsync(byButton(m.container, /Отправить всем/)!);
    await settle();
    expect(post.mock.calls.some(([, body]) => body.action === 'curious_send')).toBe(true);
  });
});
