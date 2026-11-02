import { describe, it, expect } from 'vitest';
import { imageAttachmentPreview } from './attachmentPreview';

const FILE = 'https://my.linkeon.io/smm-media/linkeon-chat-files/8b75c10c-0ddf-41b0-b780-7e54bc1175f9/seatmap.jpg';

describe('imageAttachmentPreview', () => {
  it('картинка файла чата на проде → миниатюра по ключу и оригинал', () => {
    const a = imageAttachmentPreview(FILE);
    expect(a).not.toBeNull();
    expect(a!.fullUrl).toBe(FILE);
    expect(a!.thumbUrl).toBe(
      '/webhook/chat/thumb?src=' +
        encodeURIComponent('linkeon-chat-files/8b75c10c-0ddf-41b0-b780-7e54bc1175f9/seatmap.jpg'),
    );
  });

  it('относительный адрес и тестовый стенд — тоже', () => {
    expect(imageAttachmentPreview('/smm-media/linkeon-chat-files/k/a.png')).not.toBeNull();
    expect(imageAttachmentPreview('https://test.linkeon.io/smm-media/linkeon-chat-files/k/a.webp')).not.toBeNull();
  });

  it('расширение — без учёта регистра; query и hash в ключ не попадают', () => {
    const a = imageAttachmentPreview('https://my.linkeon.io/smm-media/linkeon-chat-files/k/PHOTO.JPEG?x=1#y');
    expect(a!.thumbUrl).toBe('/webhook/chat/thumb?src=' + encodeURIComponent('linkeon-chat-files/k/PHOTO.JPEG'));
  });

  it('закодированное имя раскодируется в ключ (как его ждёт ручка миниатюр)', () => {
    const a = imageAttachmentPreview('https://my.linkeon.io/smm-media/linkeon-chat-files/k/%D1%81%D1%85%D0%B5%D0%BC%D0%B0%20%D0%B7%D0%B0%D0%BB%D0%B0.png');
    expect(a!.thumbUrl).toBe('/webhook/chat/thumb?src=' + encodeURIComponent('linkeon-chat-files/k/схема зала.png'));
  });

  it.each([
    ['не картинка', 'https://my.linkeon.io/smm-media/linkeon-chat-files/k/report.pdf'],
    ['чужой хост с тем же путём', 'https://evil.example/smm-media/linkeon-chat-files/k/a.jpg'],
    ['другой бакет', 'https://my.linkeon.io/smm-media/linkeon-assets/images/a.jpg'],
    ['кабинет', 'https://my.linkeon.io/profile?open=zoom'],
    ['битая кодировка', 'https://my.linkeon.io/smm-media/linkeon-chat-files/k/%E0%A4%A.jpg'],
    ['выход из каталога', 'https://my.linkeon.io/smm-media/linkeon-chat-files/k/../../x.jpg'],
    ['не веб-схема', 'javascript:alert(1)//linkeon-chat-files/a.jpg'],
    ['пусто', ''],
  ])('%s → null', (_name, href) => {
    expect(imageAttachmentPreview(href)).toBeNull();
  });
});
