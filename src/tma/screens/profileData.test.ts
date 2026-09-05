import { describe, it, expect, vi } from 'vitest';
import { extractProfile, saveProfile, uploadAvatar } from './profileData';

describe('extractProfile', () => {
  it('читает profileJson из массива — реальную форму /webhook/profile', () => {
    const raw = [{ profileJson: { name: 'Аня', familyName: '', nickname: '', birthday: '1990-01-01', language: 'ru' } }];
    expect(extractProfile(raw)).toEqual({ name: 'Аня', familyName: '', nickname: '', birthday: '1990-01-01', language: 'ru' });
  });

  it('терпит старый формат profile_data', () => {
    const raw = [{ profile_data: { name: 'Bob' } }];
    expect(extractProfile(raw)).toEqual({ name: 'Bob', familyName: '', nickname: '', birthday: '', language: null });
  });

  it('пустые значения по умолчанию, без исключений', () => {
    expect(extractProfile(null)).toEqual({ name: '', familyName: '', nickname: '', birthday: '', language: null });
    expect(extractProfile([{ profileJson: {} }])).toEqual({ name: '', familyName: '', nickname: '', birthday: '', language: null });
  });
});

describe('saveProfile', () => {
  it('отправляет язык в теле и переключает i18n после успешного сохранения', async () => {
    const postJson = vi.fn(async () => ({ success: true }));
    const changeLanguage = vi.fn(async () => {});
    await saveProfile({ name: 'Аня', familyName: '', nickname: '', birthday: '1990-01-01', language: 'es' }, { postJson, changeLanguage });

    expect(postJson).toHaveBeenCalledWith('/webhook/profile-update', {
      name: 'Аня', family_name: '', user_nickname: '', birthday: '1990-01-01', language: 'es',
    });
    expect(changeLanguage).toHaveBeenCalledWith('es');
  });

  it('не бросает переключение языка при незаполненном language', async () => {
    const postJson = vi.fn(async () => ({ success: true }));
    const changeLanguage = vi.fn(async () => {});
    await saveProfile({ name: 'Аня', familyName: '', nickname: '', birthday: '', language: null as any }, { postJson, changeLanguage });
    expect(changeLanguage).not.toHaveBeenCalled();
  });
});

describe('uploadAvatar', () => {
  it('идёт через putForm с multipart-полем file, не через apiClient.put', async () => {
    // Явная сигнатура важна: без неё vi.fn() выводит тип параметров из
    // тела (пустой), а putForm.mock.calls[0] превращается в пустой
    // кортеж — деструктуризация ниже не типизируется.
    const putForm = vi.fn(async (_url: string, _body: FormData) => ({ success: true }));
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

describe('паритет с веб-профилем', () => {
  it('читает фамилию и никнейм из тех же ключей, что пишет веб', () => {
    // Веб кладёт family_name и user_nickname в тот же свободный JSONB.
    // Назвать их в мини-аппе иначе значило бы завести второй набор полей об
    // одном человеке, и профили разъехались бы молча.
    const got = extractProfile([{ profileJson: {
      name: 'Дмитрий', family_name: 'Волков', user_nickname: 'dv',
    } }]);
    expect(got).toMatchObject({ name: 'Дмитрий', familyName: 'Волков', nickname: 'dv' });
  });

  it('отсутствующие поля — пустые строки, а не undefined', () => {
    const got = extractProfile([{ profileJson: { name: 'Дмитрий' } }]);
    expect(got.familyName).toBe('');
    expect(got.nickname).toBe('');
  });

  it('сохранение шлёт их под веб-именами', async () => {
    const postJson = vi.fn().mockResolvedValue({});
    await saveProfile(
      { name: 'Д', familyName: 'В', nickname: 'dv', birthday: '', language: null },
      { postJson, changeLanguage: vi.fn() },
    );
    expect(postJson).toHaveBeenCalledWith('/webhook/profile-update', expect.objectContaining({
      family_name: 'В', user_nickname: 'dv',
    }));
  });
});
