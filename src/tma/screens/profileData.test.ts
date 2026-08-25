import { describe, it, expect, vi } from 'vitest';
import { extractProfile, saveProfile, uploadAvatar } from './profileData';

describe('extractProfile', () => {
  it('читает profileJson из массива — реальную форму /webhook/profile', () => {
    const raw = [{ profileJson: { name: 'Аня', birthday: '1990-01-01', language: 'ru' } }];
    expect(extractProfile(raw)).toEqual({ name: 'Аня', birthday: '1990-01-01', language: 'ru' });
  });

  it('терпит старый формат profile_data', () => {
    const raw = [{ profile_data: { name: 'Bob' } }];
    expect(extractProfile(raw)).toEqual({ name: 'Bob', birthday: '', language: null });
  });

  it('пустые значения по умолчанию, без исключений', () => {
    expect(extractProfile(null)).toEqual({ name: '', birthday: '', language: null });
    expect(extractProfile([{ profileJson: {} }])).toEqual({ name: '', birthday: '', language: null });
  });
});

describe('saveProfile', () => {
  it('отправляет язык в теле и переключает i18n после успешного сохранения', async () => {
    const postJson = vi.fn(async () => ({ success: true }));
    const changeLanguage = vi.fn(async () => {});
    await saveProfile({ name: 'Аня', birthday: '1990-01-01', language: 'es' }, { postJson, changeLanguage });

    expect(postJson).toHaveBeenCalledWith('/webhook/profile-update', {
      name: 'Аня', birthday: '1990-01-01', language: 'es',
    });
    expect(changeLanguage).toHaveBeenCalledWith('es');
  });

  it('не бросает переключение языка при незаполненном language', async () => {
    const postJson = vi.fn(async () => ({ success: true }));
    const changeLanguage = vi.fn(async () => {});
    await saveProfile({ name: 'Аня', birthday: '', language: null as any }, { postJson, changeLanguage });
    expect(changeLanguage).not.toHaveBeenCalled();
  });
});

describe('uploadAvatar', () => {
  it('идёт через putForm с multipart-полем file, не через apiClient.put', async () => {
    const putForm = vi.fn(async () => ({ success: true }));
    const blob = new Blob(['x']);
    const getAvatarBlob = vi.fn(async () => blob);

    const file = new File(['x'], 'a.png', { type: 'image/png' });
    const result = await uploadAvatar(file, { putForm, getAvatarBlob });

    expect(putForm).toHaveBeenCalledTimes(1);
    const [url, body] = putForm.mock.calls[0];
    expect(url).toBe('/webhook/avatar');
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('file')).toBe(file);
    expect(result).toBe(blob);
  });
});
