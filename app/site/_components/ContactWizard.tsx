'use client';

import { useMemo, useRef, useState } from 'react';
import {
  CONTACT_STEPS,
  buildMessage,
  visibleQuestions,
  type Answers,
  type ContactDetails,
  type Question,
} from '@/lib/site/content/contact-form';
import { track } from '@/lib/site/analytics';
import { Icon } from './icons';

/**
 * Questionnaire de contact en quatre étapes.
 *
 * Le parcours se remplit progressivement : personne ne voit quinze champs
 * d'un coup, et les questions sur le logiciel actuel n'apparaissent qu'à ceux
 * qui en ont un. Les questions vivent dans lib/site/content/contact-form.ts.
 *
 * Envoi vers /api/contact, qui enregistre la demande et notifie l'équipe. Les
 * réponses partent dans le message, en texte lisible.
 *
 * Accessibilité : chaque question est un `fieldset` avec sa `legend`, les
 * choix sont de vrais boutons radio et cases à cocher (donc navigables au
 * clavier), le changement d'étape est annoncé et le focus est porté sur le
 * titre de la nouvelle étape.
 */

const EMPTY_DETAILS: ContactDetails = {
  firstName: '',
  lastName: '',
  shop: '',
  email: '',
  phone: '',
  city: '',
  message: '',
};

export default function ContactWizard({
  /** Événement analytics ajouté à l'envoi (origine du formulaire). */
  source = 'site',
}: {
  source?: string;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [details, setDetails] = useState<ContactDetails>(EMPTY_DETAILS);
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const started = useRef(false);
  const headingRef = useRef<HTMLParagraphElement>(null);

  const step = CONTACT_STEPS[stepIndex]!;
  const total = CONTACT_STEPS.length;
  const isLast = stepIndex === total - 1;
  const questions = useMemo(() => visibleQuestions(step, answers), [step, answers]);

  function markStarted() {
    if (started.current) return;
    started.current = true;
    track('formulaire_commence', { formulaire: 'contact', source });
  }

  function setAnswer(id: string, value: string | string[]) {
    markStarted();
    setError(null);
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  function toggleAnswer(id: string, option: string) {
    markStarted();
    setAnswers((prev) => {
      const current = Array.isArray(prev[id]) ? (prev[id] as string[]) : [];
      const next = current.includes(option)
        ? current.filter((o) => o !== option)
        : [...current, option];
      return { ...prev, [id]: next };
    });
  }

  function setDetail<K extends keyof ContactDetails>(key: K, value: string) {
    markStarted();
    setDetails((prev) => ({ ...prev, [key]: value }));
  }

  /** Passe à l'étape suivante après avoir vérifié les questions obligatoires. */
  function goNext() {
    const missing = questions.find((q) => q.required && !answers[q.id]);
    if (missing) {
      setError(`Merci de répondre à : « ${missing.label} ».`);
      return;
    }
    setError(null);
    setStepIndex((i) => Math.min(i + 1, total - 1));
    focusHeading();
  }

  function goBack() {
    setError(null);
    setStepIndex((i) => Math.max(i - 1, 0));
    focusHeading();
  }

  function focusHeading() {
    // Laisse React peindre la nouvelle étape avant de déplacer le focus.
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!details.firstName.trim() || !details.lastName.trim() || !details.email.trim()) {
      setError('Merci d’indiquer votre prénom, votre nom et votre email.');
      return;
    }
    if (!consent) {
      setError('Merci de cocher la case d’accord pour que nous puissions vous répondre.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${details.firstName.trim()} ${details.lastName.trim()}`.trim(),
          shop: details.shop.trim(),
          email: details.email.trim(),
          phone: details.phone.trim(),
          message: buildMessage(answers, details),
          company: honeypot,
        }),
      });
      if (!res.ok) {
        setError('L’envoi n’a pas abouti. Réessayez dans un instant, ou écrivez-nous directement.');
        return;
      }
      setSent(true);
      track('formulaire_envoye', { formulaire: 'contact', source });
      const motif = answers.motif;
      if (typeof motif === 'string' && motif.includes('démonstration')) {
        track('reserver_demo', { source });
      }
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
        <h3 className="hp-h3" style={{ marginTop: '1rem' }}>Demande envoyée.</h3>
        <p className="hp-small" style={{ marginTop: '0.75rem' }}>
          Merci pour ces précisions : elles nous permettent de vous répondre utilement, et pas avec
          un message type. Nous revenons vers vous à l’adresse indiquée.
        </p>
      </div>
    );
  }

  return (
    <form name="contact" onSubmit={onSubmit} noValidate>
      {/* Progression */}
      <div className="hp-steps">
        <p className="hp-steps-label">
          <b>
            {stepIndex + 1}/{total}
          </b>{' '}
          — {step.short}
        </p>
        <ol className="hp-steps-bar">
          {CONTACT_STEPS.map((s, i) => (
            <li key={s.short} data-done={i <= stepIndex} aria-hidden="true" />
          ))}
        </ol>
      </div>

      <p
        ref={headingRef}
        tabIndex={-1}
        className="hp-h3"
        style={{ marginTop: '1.5rem', outline: 'none' }}
        aria-live="polite"
      >
        {step.title}
      </p>

      <div style={{ display: 'grid', gap: '2rem', marginTop: '1.75rem' }}>
        {questions.map((q) => (
          <QuestionField
            key={q.id}
            question={q}
            value={answers[q.id]}
            onPick={(v) => setAnswer(q.id, v)}
            onToggle={(o) => toggleAnswer(q.id, o)}
          />
        ))}

        {isLast ? (
          <>
            <fieldset className="hp-fieldset">
              <legend className="hp-h4">Vos coordonnées</legend>
              <div className="hp-cols hp-cols--2" style={{ gap: '1rem', marginTop: '1rem' }}>
                <div className="hp-field">
                  <label htmlFor="w-first">Prénom *</label>
                  <input
                    id="w-first"
                    className="hp-input"
                    autoComplete="given-name"
                    required
                    value={details.firstName}
                    onChange={(e) => setDetail('firstName', e.target.value)}
                  />
                </div>
                <div className="hp-field">
                  <label htmlFor="w-last">Nom *</label>
                  <input
                    id="w-last"
                    className="hp-input"
                    autoComplete="family-name"
                    required
                    value={details.lastName}
                    onChange={(e) => setDetail('lastName', e.target.value)}
                  />
                </div>
              </div>

              <div className="hp-field" style={{ marginTop: '1rem' }}>
                <label htmlFor="w-shop">Nom du commerce / enseigne</label>
                <input
                  id="w-shop"
                  className="hp-input"
                  autoComplete="organization"
                  value={details.shop}
                  onChange={(e) => setDetail('shop', e.target.value)}
                />
              </div>

              <div className="hp-cols hp-cols--2" style={{ gap: '1rem', marginTop: '1rem' }}>
                <div className="hp-field">
                  <label htmlFor="w-email">Email *</label>
                  <input
                    id="w-email"
                    type="email"
                    inputMode="email"
                    className="hp-input"
                    autoComplete="email"
                    required
                    value={details.email}
                    onChange={(e) => setDetail('email', e.target.value)}
                  />
                </div>
                <div className="hp-field">
                  <label htmlFor="w-phone">Téléphone</label>
                  <input
                    id="w-phone"
                    type="tel"
                    inputMode="tel"
                    className="hp-input"
                    autoComplete="tel"
                    value={details.phone}
                    onChange={(e) => setDetail('phone', e.target.value)}
                  />
                </div>
              </div>

              <div className="hp-field" style={{ marginTop: '1rem' }}>
                <label htmlFor="w-city">Code postal / ville</label>
                <input
                  id="w-city"
                  className="hp-input"
                  autoComplete="postal-code"
                  value={details.city}
                  onChange={(e) => setDetail('city', e.target.value)}
                />
              </div>

              <div className="hp-field" style={{ marginTop: '1rem' }}>
                <label htmlFor="w-message">Message complémentaire</label>
                <textarea
                  id="w-message"
                  className="hp-textarea"
                  maxLength={2000}
                  value={details.message}
                  onChange={(e) => setDetail('message', e.target.value)}
                  placeholder="Ce que vous voulez ajouter, en quelques lignes."
                />
                <span className="hp-hint">Facultatif.</span>
              </div>
            </fieldset>

            <label className="hp-consent">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                required
              />
              <span>
                J’accepte que HelloPos utilise les informations transmises afin de répondre à ma
                demande. <a className="hp-link" href="/confidentialite">Confidentialité</a>
              </span>
            </label>
          </>
        ) : null}

        {/* Piège à robots : masqué à l'écran et aux lecteurs d'écran. */}
        <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }}>
          <label htmlFor="w-company">Ne pas remplir</label>
          <input
            id="w-company"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>
      </div>

      {error ? (
        <p role="alert" className="hp-small" style={{ marginTop: '1.5rem', color: '#a33a2c' }}>
          {error}
        </p>
      ) : null}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '0.75rem',
          marginTop: '2rem',
        }}
      >
        {stepIndex > 0 ? (
          <button type="button" className="hp-btn hp-btn--ghost" onClick={goBack} disabled={busy}>
            Précédent
          </button>
        ) : null}

        {isLast ? (
          <button type="submit" className="hp-btn hp-btn--primary hp-btn--lg" disabled={busy}>
            {busy ? 'Envoi…' : 'Envoyer ma demande'}
          </button>
        ) : (
          <button type="button" className="hp-btn hp-btn--primary" onClick={goNext}>
            Continuer
          </button>
        )}
      </div>
    </form>
  );
}

/** Une question : choix unique, choix multiples, ou champ libre. */
function QuestionField({
  question,
  value,
  onPick,
  onToggle,
}: {
  question: Question;
  value: string | string[] | undefined;
  onPick: (value: string) => void;
  onToggle: (option: string) => void;
}) {
  if (question.kind === 'text') {
    return (
      <div className="hp-field">
        <label htmlFor={`q-${question.id}`}>{question.label}</label>
        <input
          id={`q-${question.id}`}
          className="hp-input"
          value={typeof value === 'string' ? value : ''}
          placeholder={question.placeholder}
          onChange={(e) => onPick(e.target.value)}
        />
        {question.hint ? <span className="hp-hint">{question.hint}</span> : null}
      </div>
    );
  }

  const multi = question.kind === 'multi';
  const selected = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];

  return (
    <fieldset className="hp-fieldset">
      <legend>
        {question.label}
        {question.required ? ' *' : ''}
      </legend>
      {question.hint ? <p className="hp-hint">{question.hint}</p> : null}
      <div className="hp-choices">
        {(question.options ?? []).map((option) => (
          <label key={option} className="hp-choice">
            <input
              type={multi ? 'checkbox' : 'radio'}
              name={`q-${question.id}`}
              value={option}
              checked={selected.includes(option)}
              onChange={() => (multi ? onToggle(option) : onPick(option))}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
