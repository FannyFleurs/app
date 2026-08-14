'use client';

import { useState } from 'react';

const GREEN = '#013E37';
const BORDER = '#E7E3D8';
const IVORY = '#F8F6F0';
const INK_SOFT = '#5A625E';

/**
 * Collecte d'adresses email en bas de page. Formulaire volontairement minimal
 * (une adresse), sans pression : un simple opt-in aux conseils/nouveautés.
 * POST vers /api/subscribe, avec piège anti-robot et états d'envoi.
 */
export default function EmailCapture() {
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState(''); // honeypot
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === 'sending') return;
    setState('sending');
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, company }),
      });
      if (!res.ok) throw new Error('bad status');
      setState('done');
    } catch {
      setState('error');
    }
  }

  return (
    <section style={{ backgroundColor: IVORY, borderTop: `1px solid ${BORDER}` }}>
      <div className="max-w-4xl mx-auto px-5 sm:px-6 py-14 md:py-16">
        <div
          className="rounded-2xl bg-white p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6"
          style={{ border: `1px solid ${BORDER}` }}
        >
          <div className="max-w-md">
            <h2 className="text-xl md:text-2xl font-bold tracking-tight">
              Recevez nos conseils pour votre boutique
            </h2>
            <p className="mt-2 text-sm" style={{ color: INK_SOFT }}>
              Un email de temps en temps, des idées concrètes pour vendre plus et
              gérer moins. Désinscription en un clic.
            </p>
          </div>

          {state === 'done' ? (
            <div className="flex items-center gap-2 font-semibold shrink-0" style={{ color: GREEN }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 12 4 4L19 6" />
              </svg>
              Merci, c’est noté !
            </div>
          ) : (
            <form onSubmit={submit} className="w-full md:w-auto shrink-0">
              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  type="email"
                  required
                  placeholder="vous@boutique.fr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-label="Votre adresse email"
                  className="h-12 rounded-xl border px-3.5 text-base bg-white outline-none sm:w-64"
                  style={{ borderColor: BORDER }}
                />
                {/* Honeypot anti-robot : masqué, doit rester vide. */}
                <div aria-hidden className="absolute -left-[9999px] top-auto h-0 w-0 overflow-hidden">
                  <label>
                    Société
                    <input tabIndex={-1} autoComplete="off" value={company} onChange={(e) => setCompany(e.target.value)} />
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={state === 'sending'}
                  className="site-btn site-btn-primary h-12 px-5 rounded-xl text-base font-semibold text-white whitespace-nowrap disabled:opacity-70"
                  style={{ backgroundColor: GREEN }}
                >
                  {state === 'sending' ? 'Envoi…' : 'Je m’inscris'}
                </button>
              </div>
              {state === 'error' && (
                <p className="mt-2 text-xs" style={{ color: '#B4342B' }}>
                  Une erreur est survenue. Réessayez dans un instant.
                </p>
              )}
              <p className="mt-2 text-xs" style={{ color: INK_SOFT }}>
                En vous inscrivant, vous acceptez notre{' '}
                <a href="/confidentialite" className="underline" style={{ color: GREEN }}>politique de confidentialité</a>.
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
