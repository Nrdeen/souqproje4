export type FacebookPopupResult =
  | {
      ok: true;
      intent: 'auth';
      isNewUser: boolean;
      needsProfileCompletion: boolean;
    }
  | {
      ok: true;
      intent: 'link';
      linkToken: string;
      email?: string | null;
    }
  | {
      ok: false;
      code: string;
      error: string;
      linkToken?: string;
      email?: string | null;
    };

export function isTrustedFacebookAuthUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'www.facebook.com' || parsed.hostname === 'm.facebook.com')
    );
  } catch {
    return false;
  }
}

export function openFacebookOAuthPopup(authUrl: string): Promise<FacebookPopupResult> {
  if (typeof window === 'undefined') {
    return Promise.resolve({
      ok: false,
      code: 'unsupported_env',
      error: 'المصادقة عبر Facebook متاحة من المتصفح فقط',
    });
  }

  if (!isTrustedFacebookAuthUrl(authUrl)) {
    return Promise.resolve({
      ok: false,
      code: 'untrusted_oauth_url',
      error: 'رابط المصادقة من Facebook غير موثوق',
    });
  }

  const width = 520;
  const height = 640;
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));

  const popup = window.open(
    authUrl,
    'souq-facebook-auth',
    `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
  );

  if (!popup) {
    return Promise.resolve({
      ok: false,
      code: 'popup_blocked',
      error: 'تعذر فتح نافذة Facebook المنبثقة؛ يرجى السماح بالنوافذ المنبثقة لهذا الموقع ثم المحاولة مجدداً.',
    });
  }

  return new Promise<FacebookPopupResult>((resolve) => {
    let settled = false;
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      window.clearInterval(pollTimer);
      window.clearTimeout(timeoutTimer);
    };
    const finish = (result: FacebookPopupResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.type !== 'souq-facebook-auth') return;
      if (data.ok) {
        if (data.intent === 'link' && typeof data.linkToken === 'string' && data.linkToken) {
          finish({
            ok: true,
            intent: 'link',
            linkToken: data.linkToken,
            email: typeof data.email === 'string' ? data.email : null,
          });
          return;
        }
        finish({
          ok: true,
          intent: 'auth',
          isNewUser: Boolean(data.isNewUser),
          needsProfileCompletion: Boolean(data.needsProfileCompletion),
        });
      } else {
        finish({
          ok: false,
          code: typeof data.code === 'string' ? data.code : 'facebook_oauth_error',
          error:
            typeof data.error === 'string' && data.error.trim()
              ? data.error
              : 'تعذر إتمام تسجيل الدخول عبر Facebook',
          ...(typeof data.linkToken === 'string' && data.linkToken
            ? { linkToken: data.linkToken }
            : {}),
          ...(typeof data.email === 'string' ? { email: data.email } : {}),
        });
      }
    };

    window.addEventListener('message', onMessage);

    const pollTimer = window.setInterval(() => {
      if (popup.closed) {
        finish({
          ok: false,
          code: 'facebook_canceled',
          error: 'تم إغلاق نافذة تسجيل الدخول عبر Facebook قبل إتمام العملية',
        });
      }
    }, 450);

    const timeoutTimer = window.setTimeout(() => {
      try {
        if (!popup.closed) popup.close();
      } catch {
        // ignore cross-origin window close restriction
      }
      finish({
        ok: false,
        code: 'facebook_timeout',
        error: 'انتهت مهلة المصادقة عبر Facebook، يرجى المحاولة مرة أخرى',
      });
    }, 3 * 60_000);
  });
}
