import { useEffect } from 'react';

interface UseOTPAutoFillProps {
  onCodeReceived: (code: string) => void;
  enabled?: boolean;
}

export const useOTPAutoFill = ({ onCodeReceived, enabled = true }: UseOTPAutoFillProps) => {
  useEffect(() => {
    if (!enabled) return;

    const isWebOTPSupported = 'OTPCredential' in window;

    if (!isWebOTPSupported) {
      console.log('WebOTP API is not supported in this browser');
      return;
    }

    const abortController = new AbortController();

    const startOTPListener = async () => {
      try {
        if ('credentials' in navigator) {
          const otpCredential = await (navigator.credentials as any).get({
            otp: { transport: ['sms'] },
            signal: abortController.signal,
          });

          if (otpCredential?.code) {
            const code = otpCredential.code;
            const match = code.match(/\d{6}/);

            if (match) {
              onCodeReceived(match[0]);
            }
          }
        }
      } catch (error: any) {
        if (error?.name !== 'AbortError') {
          console.error('Error receiving OTP:', error);
        }
      }
    };

    startOTPListener();

    return () => {
      abortController.abort();
    };
  }, [onCodeReceived, enabled]);
};
