import { afterEach, describe, it, expect, vi } from 'vitest';
import { imageAttachmentPreview } from './attachmentPreview';

const FILE = 'https://my.linkeon.io/smm-media/linkeon-chat-files/8b75c10c-0ddf-41b0-b780-7e54bc1175f9/seatmap.jpg';

// В теле теста легко забыть снять стаб при раннем throw/return — тогда он
// утёк бы в следующий тест этого файла (VITE_BACKEND_URL там же, в afterEach,
// а не в конце каждого it).
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('imageAttachmentPreview', () => {
  it('картинка файла чата на проде → адрес и имя', () => {
    const a = imageAttachmentPreview(FILE);
    expect(a).not.toBeNull();
    expect(a!.fullUrl).toBe(FILE);
    expect(a!.name).toBe('seatmap.jpg');
  });

  it('относительный адрес и тестовый стенд (/minio/) — тоже', () => {
    expect(imageAttachmentPreview('/smm-media/linkeon-chat-files/k/a.png')).not.toBeNull();
    expect(imageAttachmentPreview('https://test.linkeon.io/minio/linkeon-chat-files/k/a.webp')).not.toBeNull();
  });

  it('относительный адрес — fullUrl собирается от VITE_BACKEND_URL (значение-маркер), не буквальный href', () => {
    // Маркер, отличный от любого из OUR_HOSTS: совпади он случайно с
    // my.linkeon.io, тест прошёл бы и при старой зашитой базе, не заметив
    // регрессию — см. plainRelative-резолв ниже, который раньше резолвился
    // мимо этой переменной для ряда форм (bare-relative, ./, ../).
    vi.stubEnv('VITE_BACKEND_URL', 'https://backend.example');
    expect(imageAttachmentPreview('/smm-media/linkeon-chat-files/k/a.png')!.fullUrl).toBe(
      'https://backend.example/smm-media/linkeon-chat-files/k/a.png',
    );
  });

  it('расширение — без учёта регистра; query и hash отрезаются от fullUrl', () => {
    const a = imageAttachmentPreview('https://my.linkeon.io/smm-media/linkeon-chat-files/k/PHOTO.JPEG?x=1#y');
    expect(a!.fullUrl).toBe('https://my.linkeon.io/smm-media/linkeon-chat-files/k/PHOTO.JPEG');
    expect(a!.name).toBe('PHOTO.JPEG');
  });

  it('закодированное имя раскодируется (для alt и просмотрщика)', () => {
    const a = imageAttachmentPreview(
      'https://my.linkeon.io/smm-media/linkeon-chat-files/k/%D1%81%D1%85%D0%B5%D0%BC%D0%B0%20%D0%B7%D0%B0%D0%BB%D0%B0.png',
    );
    expect(a!.name).toBe('схема зала.png');
  });

  it.each([
    ['не картинка', 'https://my.linkeon.io/smm-media/linkeon-chat-files/k/report.pdf'],
    ['чужой хост с тем же путём', 'https://evil.example/smm-media/linkeon-chat-files/k/a.jpg'],
    ['протокол-относительный чужой хост', '//evil.example/smm-media/linkeon-chat-files/k/a.jpg'],
    ['обратная косая к чужому хосту', '/\\evil.example/smm-media/linkeon-chat-files/k/a.jpg'],
    ['логин в адресе — настоящий хост наш, но это не он', 'https://evil.example@my.linkeon.io/smm-media/linkeon-chat-files/k/a.jpg'],
    ['порт в адресе', 'https://my.linkeon.io:8443/smm-media/linkeon-chat-files/k/a.jpg'],
    ['http вместо https', 'http://my.linkeon.io/smm-media/linkeon-chat-files/k/a.jpg'],
    ['другой бакет', 'https://my.linkeon.io/smm-media/linkeon-assets/images/a.jpg'],
    ['кабинет', 'https://my.linkeon.io/profile?open=zoom'],
    ['битая кодировка', 'https://my.linkeon.io/smm-media/linkeon-chat-files/k/%E0%A4%A.jpg'],
    ['выход из каталога', 'https://my.linkeon.io/smm-media/linkeon-chat-files/k/../../x.jpg'],
    ['закодированный слэш в имени', 'https://my.linkeon.io/smm-media/linkeon-chat-files/k%2F..%2F..%2Fx.jpg'],
    ['не веб-схема', 'javascript:alert(1)//linkeon-chat-files/a.jpg'],
    ['пусто', ''],
    // Без ведущего «/» — new URL(href, 'https://my.linkeon.io') резолвит его
    // как путь ОТ КОРНЯ этой зашитой базы (сам путь становится
    // /smm-media/…), и раньше это проходило все проверки и давало ссылку на
    // my.linkeon.io мимо VITE_BACKEND_URL текущей среды (test.linkeon.io
    // получил бы чужой хост в адресе своего же файла). Релей такую форму не
    // пишет — только настоящий абсолютный https:// или путь с одного
    // ведущего слэша.
    ['относительный без ведущего слэша', 'smm-media/linkeon-chat-files/k/a.jpg'],
    ['точка-относительный', './smm-media/linkeon-chat-files/k/a.jpg'],
    ['выход на уровень выше без ведущего слэша', '../smm-media/linkeon-chat-files/k/a.jpg'],
    // Протокол-относительный адрес на СВОЙ же хост: форма не абсолютная
    // (нет https:) и не «один ведущий слэш» (второй символ — тоже «/»), но
    // url.hostname совпадает с my.linkeon.io — раньше это обманывало
    // проверку хоста и давало «настоящий» на вид fullUrl.
    ['протокол-относительный свой хост', '//my.linkeon.io/smm-media/linkeon-chat-files/k/a.jpg'],
  ])('%s → null', (_name, href) => {
    expect(imageAttachmentPreview(href)).toBeNull();
  });
});
