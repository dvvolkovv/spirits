// @vitest-environment jsdom
//
// Экран входа по SMS: что человек видит, когда сервер отказал в отправке кода.
// Отказ с объяснением (лимит SMS, неверный номер) authService уже перевёл —
// его и надо показать, а не общее «Ошибка отправки СМС», после которого
// человек жмёт снова и снова упирается в тот же лимит.
//
// Поле телефона и экран кода подменены кнопками: их собственная логика здесь
// ни при чём, нужен только момент «номер отправлен» и «запросить код снова».
import { describe, it, expect, vi, beforeEach } from 'vitest';
import toast from 'react-hot-toast';
import { mount, byButton, clickAsync, tRu } from '../../test/dom';
import SmsLoginPane from './SmsLoginPane';
import { authService } from '../../services/authService';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t }) };
});
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ login: vi.fn() }) }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../../services/authService', () => ({
  authService: { requestSMSCode: vi.fn(), verifyCode: vi.fn() },
  STORAGE_FULL: 'Storage unavailable',
}));
vi.mock('./PhoneInput', () => ({
  default: (p: { onSubmit: (phone: string) => void }) => (
    <button type="button" onClick={() => p.onSubmit('79991234567')}>phone-submit</button>
  ),
}));
vi.mock('./OTPInput', () => ({
  default: (p: { onResend: () => void }) => (
    <button type="button" onClick={p.onResend}>otp-resend</button>
  ),
}));

const requestSMSCode = vi.mocked(authService.requestSMSCode);
const toastError = vi.mocked(toast.error);

const LIMIT = 'Слишком часто. Новый код можно запросить через 57 минут.';
const INVALID = 'Проверьте номер телефона.';

async function submitPhone() {
  const { container } = mount(<SmsLoginPane />);
  await clickAsync(byButton(container, /phone-submit/)!);
  return container;
}

describe('вход по SMS: отказ в отправке кода', () => {
  beforeEach(() => vi.clearAllMocks());

  it('лимит SMS — показана фраза со сроком, а не «ошибка отправки»', async () => {
    requestSMSCode.mockResolvedValue({ success: false, error: 'too_many_requests', retryAfterSec: 3420, message: LIMIT });
    await submitPhone();
    expect(toastError.mock.calls).toEqual([[LIMIT]]);
  });

  it('неверный номер — «Проверьте номер телефона.»', async () => {
    requestSMSCode.mockResolvedValue({ success: false, error: 'invalid_phone', message: INVALID });
    await submitPhone();
    expect(toastError.mock.calls).toEqual([[INVALID]]);
  });

  it('отказ без объяснения — прежнее «Ошибка отправки СМС», служебный текст не показывается', async () => {
    requestSMSCode.mockResolvedValue({ success: false, message: 'Failed to send SMS' });
    await submitPhone();
    expect(toastError.mock.calls).toEqual([[tRu('auth.sms.sendError')]]);
  });

  it('повторный запрос кода упёрся в лимит — та же фраза со сроком', async () => {
    requestSMSCode.mockResolvedValueOnce({ success: true, message: 'SMS sent' });
    const container = await submitPhone();
    expect(toastError).not.toHaveBeenCalled();

    requestSMSCode.mockResolvedValueOnce({ success: false, error: 'too_many_requests', retryAfterSec: 3420, message: LIMIT });
    await clickAsync(byButton(container, /otp-resend/)!);
    expect(toastError.mock.calls).toEqual([[LIMIT]]);
  });

  it('повторный запрос без объяснения — прежнее «Ошибка повторной отправки»', async () => {
    requestSMSCode.mockResolvedValueOnce({ success: true, message: 'SMS sent' });
    const container = await submitPhone();
    requestSMSCode.mockResolvedValueOnce({ success: false, message: 'Network error' });
    await clickAsync(byButton(container, /otp-resend/)!);
    expect(toastError.mock.calls).toEqual([[tRu('auth.sms.resendError')]]);
  });
});
