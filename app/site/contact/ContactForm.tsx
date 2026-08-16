'use client';

import { useState } from 'react';
import { track } from '@/lib/site/analytics';
import { Icon } from '../_components/icons';

/**
 * Formulaire de contact et de démonstration.
 *
 * Envoi vers /api/contact : la demande est enregistrée en base et notifiée
 * par email. Le champ « company » est un piège à robots — invisible à
 * l'écran, ignoré côté serveur s'il est rempli.
 *
 * Accessibilité : chaque champ a son <label>, les erreurs sont annoncées
 * dans une zone `role="alert"`, et le succès dans une zone `role="status"`.
 */

interface State {
  name: string;
  shop: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  company: string;
}

const SUBJECTS = [
  'Découvrir HelloPos (démo)',
  'Vérifier mon matériel',
  'Question sur les tarifs',
  'Plusieurs boutiques',
  'Autre sujet',
];

export default function ContactForm({
  defaultSubject,
  /**
   * Proposer la création d'espace après l'envoi. Désactivé sur la page
   * d'attente : l'inscription en ligne y est fermée, le bouton mènerait
   * à une impasse.
   */
  showTrialCta = true,
  /** Masque la boutique et le sujet : version courte, pour une fenêtre. */
  compact = false,
}: {
  defaultSubject?: string;
  showTrialCta?: boolean;
  compact?: boolean;
}) {
  const [f, setF] = useState<State>({
    name: '',
    shop: '',
    email: '',
    phone: '',
    subject: defaultSubject && SUBJECTS.includes(defaultSubject) ? defaultSubject : SUBJECTS[0]!,
    message: '',
    company: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function set<K extends keyof State>(key: K, value: State[K]) {
    setF((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: f.name,
          shop: f.shop,
          email: f.email,
          phone: f.phone,
          message: `[${f.subject}]\n\n${f.message}`,
          company: f.company,
        }),
      });
      if (!res.ok) {
        setError('L’envoi n’a pas abouti. Réessayez, ou écrivez-nous directement par email.');
        return;
      }
      setSent(true);
      track('formulaire_envoye', { sujet: f.subject });
      track('reserver_demo', { source: 'formulaire' });
    } catch {
      setError('Connexion interrompue. Vérifiez votre réseau et réessayez.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="hp-card" role="status">
        <span aria-hidden="true" className="hp-yes">
          <Icon name="check" size={28} />
        </span>
        <h2 className="hp-h3" style={{ marginTop: '1rem' }}>Message envoyé.</h2>
        <p className="hp-small" style={{ marginTop: '0.75rem' }}>
          Nous revenons vers vous rapidement, à l’adresse indiquée.
          {showTrialCta ? ' En attendant, vous pouvez déjà créer votre espace et commencer l’essai.' : ''}
        </p>
        {showTrialCta ? (
          <p style={{ marginTop: '1.5rem' }}>
            <a className="hp-btn hp-btn--primary" href="/setup" data-track="essai_hellopos">
              Créer mon espace
            </a>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form name="contact" onSubmit={onSubmit} noValidate={false} style={{ display: 'grid', gap: '1.25rem' }}>
      <div className="hp-cols hp-cols--2" style={{ gap: '1.25rem' }}>
        <div className="hp-field">
          <label htmlFor="c-name">Votre nom *</label>
          <input
            id="c-name"
            className="hp-input"
            autoComplete="name"
            required
            value={f.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </div>
        {compact ? null : (
          <div className="hp-field">
            <label htmlFor="c-shop">Votre boutique</label>
            <input
              id="c-shop"
              className="hp-input"
              autoComplete="organization"
              value={f.shop}
              onChange={(e) => set('shop', e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="hp-cols hp-cols--2" style={{ gap: '1.25rem' }}>
        <div className="hp-field">
          <label htmlFor="c-email">Email *</label>
          <input
            id="c-email"
            type="email"
            className="hp-input"
            autoComplete="email"
            inputMode="email"
            required
            value={f.email}
            onChange={(e) => set('email', e.target.value)}
          />
        </div>
        <div className="hp-field">
          <label htmlFor="c-phone">Téléphone</label>
          <input
            id="c-phone"
            type="tel"
            className="hp-input"
            autoComplete="tel"
            inputMode="tel"
            value={f.phone}
            onChange={(e) => set('phone', e.target.value)}
          />
        </div>
      </div>

      {compact ? null : (
        <div className="hp-field">
          <label htmlFor="c-subject">Sujet</label>
          <select
            id="c-subject"
            className="hp-select"
            value={f.subject}
            onChange={(e) => set('subject', e.target.value)}
          >
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      )}

      <div className="hp-field">
        <label htmlFor="c-message">Votre message</label>
        <textarea
          id="c-message"
          className="hp-textarea"
          value={f.message}
          onChange={(e) => set('message', e.target.value)}
          placeholder="Ce que vous vendez, comment vous encaissez aujourd’hui, ce que vous cherchez à améliorer."
        />
        <span className="hp-hint">Plus c’est concret, plus la réponse sera utile.</span>
      </div>

      {/* Piège à robots : masqué visuellement et pour les lecteurs d'écran. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }}>
        <label htmlFor="c-company">Ne pas remplir</label>
        <input
          id="c-company"
          tabIndex={-1}
          autoComplete="off"
          value={f.company}
          onChange={(e) => set('company', e.target.value)}
        />
      </div>

      {error ? (
        <p role="alert" className="hp-small" style={{ color: '#a33a2c' }}>
          {error}
        </p>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem' }}>
        <button type="submit" className="hp-btn hp-btn--primary hp-btn--lg" disabled={busy}>
          {busy ? 'Envoi…' : 'Envoyer la demande'}
        </button>
        <p className="hp-form-note">
          Vos coordonnées servent uniquement à vous répondre.{' '}
          <a className="hp-link" href="/confidentialite">Confidentialité</a>
        </p>
      </div>
    </form>
  );
}
