import { useEffect, useRef } from 'react';

let gsiScriptPromise;
function loadGsiScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gsiScriptPromise) {
    gsiScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  return gsiScriptPromise;
}

/**
 * Renders Google's own Sign-In button once VITE_GOOGLE_CLIENT_ID is set;
 * renders nothing otherwise, same "blank config no-ops" philosophy as
 * EMAIL_PROVIDER/SMTP_HOST on the API side. `onCredential` receives the raw
 * ID token — verification happens server-side, never here.
 */
export default function GoogleSignInButton({ onCredential }) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const containerRef = useRef(null);
  const onCredentialRef = useRef(onCredential);
  useEffect(() => {
    onCredentialRef.current = onCredential;
  });

  useEffect(() => {
    if (!clientId) return undefined;
    let cancelled = false;

    loadGsiScript().then(() => {
      if (cancelled || !containerRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => onCredentialRef.current(response.credential),
      });
      window.google.accounts.id.renderButton(containerRef.current, {
        theme: 'outline',
        size: 'large',
      });
    });

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (!clientId) return null;

  return <div ref={containerRef} className="flex justify-center" />;
}
