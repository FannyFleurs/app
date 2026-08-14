'use client';

import { useState } from 'react';
import { GREEN, GREEN_DEEP, GOLD, BORDER } from '../_ui';

/**
 * Formulaire de demande de démo. À l'envoi, il POSTe réellement les données
 * vers /api/contact : la demande est enregistrée côté serveur et une
 * notification email part vers l'équipe. Aucune ouverture de la messagerie
 * du visiteur (fini le mailto).
 */
export default function ContactForm() {
  const [name, setName] = useState('');
  const [shop, setShop] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [company, setCompany] = useState(''); // honeypot
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === 'sending') return;
    setState('sending');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, shop, email, phone, message, company }),
      });
      if (!res.ok) throw new Error('bad status');
      setState('sent');
    } catch {
      setState('error');
    }
  }

  const field = 'w-full rounded-xl border px-3.5 h-12 text-base outline-none bg-white';
  const style = { borderColor: BORDER } as React.CSSProperties;

  if (state === 'sent') {
    return (
      <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: GREEN, color: '#fff' }}>
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full" style={{ backgroundColor: GOLD, color: GREEN_DEEP }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 12 4 4L19 6" />
          </svg>
        </div>
        <h3 className="mt-4 text-lg font-semibold">Demande envoyée</h3>
        <p className="mt-2 text-sm" style={{ color: 'rgba(234,230,220,0.85)' }}>
          Merci {name || ''} ! On revient vers vous sous 24 h ouvrées.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium" style={{ color: '#5A625E' }}>Votre nom</span>
          <input className={`${field} mt-1`} style={style} value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="block">
          <span className="text-sm font-medium" style={{ color: '#5A625E' }}>Votre boutique</span>
          <input className={`${field} mt-1`} style={style} value={shop} onChange={(e) => setShop(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium" style={{ color: '#5A625E' }}>Email</span>
          <input type="email" className={`${field} mt-1`} style={style} value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="block">
          <span className="text-sm font-medium" style={{ color: '#5A625E' }}>Téléphone</span>
          <input className={`${field} mt-1`} style={style} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
      </div>
      <label className="block">
        <span className="text-sm font-medium" style={{ color: '#5A625E' }}>Votre message</span>
        <textarea
          className="w-full rounded-xl border px-3.5 py-3 text-base outline-none bg-white mt-1 min-h-[120px]"
          style={style}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Combien de caisses ? Quel besoin ? Un créneau qui vous arrange ?"
        />
      </label>

      {/* Honeypot anti-robot : masqué aux humains, doit rester vide. */}
      <div aria-hidden className="absolute -left-[9999px] top-auto h-0 w-0 overflow-hidden">
        <label>
          Société
          <input tabIndex={-1} autoComplete="off" value={company} onChange={(e) => setCompany(e.target.value)} />
        </label>
      </div>

      <button
        type="submit"
        disabled={state === 'sending'}
        className="inline-flex items-center justify-center h-12 px-6 rounded-xl text-base font-semibold text-white transition-transform active:scale-95 disabled:opacity-70"
        style={{ backgroundColor: GREEN }}
      >
        {state === 'sending' ? 'Envoi…' : 'Envoyer ma demande'}
      </button>

      {state === 'error' ? (
        <p className="text-sm" style={{ color: '#B4342B' }}>
          L’envoi a échoué. Réessayez, ou écrivez-nous directement par email.
        </p>
      ) : (
        <p className="text-xs" style={{ color: '#5A625E' }}>
          Vos informations servent uniquement à vous recontacter.
        </p>
      )}
    </form>
  );
}
