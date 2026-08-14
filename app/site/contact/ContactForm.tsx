'use client';

import { useState } from 'react';
import { GREEN, BORDER } from '../_ui';

/**
 * Formulaire de demande de démo. Sans backend : à l'envoi, il compose un
 * email (mailto) pré-rempli vers l'adresse de contact, que le client termine
 * dans sa messagerie. Simple, fiable, aucun serveur à maintenir.
 */
export default function ContactForm({ to }: { to: string }) {
  const [name, setName] = useState('');
  const [shop, setShop] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const subject = `Demande de démo — ${shop || name || 'HelloPos'}`;
    const body = [
      `Nom : ${name}`,
      `Boutique : ${shop}`,
      `Email : ${email}`,
      `Téléphone : ${phone}`,
      '',
      message,
    ].join('\n');
    window.location.href =
      `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  const field = 'w-full rounded-xl border px-3.5 h-12 text-base outline-none bg-white';
  const style = { borderColor: BORDER } as React.CSSProperties;

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
      <button
        type="submit"
        className="inline-flex items-center justify-center h-12 px-6 rounded-xl text-base font-semibold text-white transition-transform active:scale-95"
        style={{ backgroundColor: GREEN }}
      >
        Envoyer ma demande
      </button>
      <p className="text-xs" style={{ color: '#5A625E' }}>
        L’envoi ouvre votre messagerie avec le message pré-rempli.
      </p>
    </form>
  );
}
