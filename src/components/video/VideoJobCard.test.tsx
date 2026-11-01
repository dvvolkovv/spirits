// @vitest-environment jsdom
/**
 * Карточка видео в чате и в галерее.
 *
 * Упавшее видео бэк возвращает сам: статус 'failed' и строка возврата пишутся
 * одной транзакцией (failAndRefund). Но под сообщением ассистента остаётся
 * число списания, посчитанное, пока ролик ещё рендерился, — 01.11.2026 человек
 * увидел «216 687 токенов» у упавшего ролика и написал жалобу, хотя всё уже
 * вернулось. Карточка должна говорить об этом прямо.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount, visibleText } from '../../test/dom';
import VideoJobCard from './VideoJobCard';
import type { VideoJob } from './useVideoJobs';

// «Поделиться» тянет authService и с ним весь i18n — карточке он здесь не нужен.
vi.mock('../../services/shareReferral', () => ({ shareWithReferral: vi.fn() }));
vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t }) };
});

const job = (over: Partial<VideoJob>): VideoJob => ({
  id: '96d87268-ecb7-4959-8301-f436bfdd5b6f',
  mode: 'text2video',
  model: 'veo-3.1-fast',
  quality: 'std',
  duration_sec: 8,
  target_duration_sec: 20,
  prompt: 'Сцена: первобытный человек высекает искру в пещере',
  status: 'processing',
  video_url: null,
  thumbnail_url: null,
  error_message: null,
  tokens_spent: 216_000,
  created_at: new Date().toISOString(),
  ...over,
});

describe('карточка видео', () => {
  it('упавшее видео — видно, что токены возвращены', () => {
    const { container } = mount(
      <VideoJobCard compact job={job({ status: 'failed', error_message: 'Omni не смог продлить ролик' })} />,
    );
    expect(visibleText(container)).toContain('Токены возвращены');
  });

  it('видео в работе — о возврате ни слова', () => {
    const { container } = mount(<VideoJobCard compact job={job({ status: 'processing' })} />);
    expect(visibleText(container)).not.toContain('Токены возвращены');
  });
});
