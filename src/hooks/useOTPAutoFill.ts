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
        console.log('WebOTP: Starting listener...');
        if ('credentials' in navigator) {
          console.log('WebOTP: Requesting OTP credential...');
          const otpCredential = await (navigator.credentials as any).get({
            otp: { transport: ['sms'] },
            signal: abortController.signal,
          });

          console.log('WebOTP: Received credential:', otpCredential);

          if (otpCredential?.code) {
            const fullText = otpCredential.code;
            console.log('Received SMS text:', fullText);

            const hashMatch = fullText.match(/#(\d{6})/);

            if (hashMatch && hashMatch[1]) {
              console.log('Extracted code from #pattern:', hashMatch[1]);
              onCodeReceived(hashMatch[1]);
            } else {
              const anyMatch = fullText.match(/\d{6}/);
              if (anyMatch) {
                console.log('Extracted code from any pattern:', anyMatch[0]);
                onCodeReceived(anyMatch[0]);
              } else {
                console.log('Could not extract code from SMS');
              }
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
