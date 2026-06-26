'use client';

import { useEffect, useState } from 'react';

/**
 * Affiche une bannière (iPad/iPhone) ou une modale (Android/Chrome) qui
 * invite l'utilisateur à installer Webpos comme PWA. La bannière
 * disparaît automatiquement dès que l'app est lancée en mode standalone
 * (depuis l'écran d'accueil iOS) ou installée.
 *
 * Sur iOS, il n'existe pas d'API pour déclencher l'installation —
 * on explique simplement le geste "Partager → Sur l'écran d'accueil".
 */
export default function InstallPrompt() {
  const [shouldShow, setShouldShow] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop' | null>(null);
  const [dismissed, setDismissed] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deferredEvent, setDeferredEvent] = useState<any>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Déjà installée → mode standalone
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // @ts-expect-error iOS-only
      window.navigator.standalone === true;
    if (isStandalone) return;

    // Détection plateforme
    const ua = window.navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window);
    const isAndroid = /Android/i.test(ua);
    if (isIOS) setPlatform('ios');
    else if (isAndroid) setPlatform('android');
    else setPlatform('desktop');

    // Déjà refusée récemment ?
    const dismissedAt = localStorage.getItem('webpos_install_dismissed');
    if (dismissedAt && Date.now() - Number(dismissedAt) < 7 * 24 * 60 * 60_000) {
      setDismissed(true);
    }

    // Android / Chrome — capte l'événement natif d'installation
    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferredEvent(e);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    setShouldShow(true);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  function dismiss() {
    localStorage.setItem('webpos_install_dismissed', String(Date.now()));
    setDismissed(true);
  }

  async function triggerNativeInstall() {
    if (!deferredEvent) return;
    deferredEvent.prompt();
    const { outcome } = await deferredEvent.userChoice;
    if (outcome === 'accepted') {
      dismiss();
    }
    setDeferredEvent(null);
  }

  if (!shouldShow || dismissed) return null;
  if (platform === 'desktop') return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-md">
      <div
        className="rounded-2xl bg-white border border-border shadow-lg p-4 flex items-start gap-3"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <div className="grid h-11 w-11 place-items-center rounded-xl accent-bar text-white text-lg font-semibold shrink-0">
          F
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold">Installer Webpos</div>
          {platform === 'ios' ? (
            <p className="mt-0.5 text-xs text-ink-soft">
              Pour utiliser l&apos;app en plein écran sur cet iPad : tapez{' '}
              <span className="inline-flex items-center px-1 rounded bg-gray-100 text-ink">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
              </span>{' '}
              en bas de Safari, puis « Sur l&apos;écran d&apos;accueil ».
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-ink-soft">
              Installez Webpos pour une expérience plein écran sans barre de navigation.
            </p>
          )}
          {platform !== 'ios' && deferredEvent && (
            <button
              onClick={() => void triggerNativeInstall()}
              className="btn-primary mt-3 text-sm h-9"
            >
              Installer
            </button>
          )}
        </div>
        <button onClick={dismiss} aria-label="Fermer"
                className="text-ink-soft hover:text-ink text-lg leading-none">
          ✕
        </button>
      </div>
    </div>
  );
}
