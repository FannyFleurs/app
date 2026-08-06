'use client';

import { useEffect, useRef, useState } from 'react';
import { PAYMENT_TERMS } from '@/lib/settings/payment-terms';

export interface CustomerLike {
  id: string;
  type: 'particulier' | 'professionnel' | 'collectivite' | 'association';
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
  email?: string | null;
  phone?: string | null;
  siret?: string | null;
  siren?: string | null;
  vat_number?: string | null;
  public_service_code?: string | null;
  commitment_number?: string | null;
  address?: { line1?: string; line2?: string; zip?: string; city?: string; country?: string } | null;
  consent_email?: boolean;
  consent_sms?: boolean;
  internal_notes?: string | null;
  loyalty_code?: string | null;
  default_discount_pct?: number | null;
  loyalty_enabled?: boolean;
  payment_terms?: string | null;
  billing_frequency?: 'manual' | 'monthly' | null;
}

/** Ce que le formulaire rend au parent quand il n'enregistre pas lui-même. */
export interface CustomerDraft {
  type: CustomerLike['type'];
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  default_discount_pct: number | null;
}

interface Props {
  customer?: CustomerLike | null;
  onClose: () => void;
  onSaved: (id: string, draft?: CustomerDraft) => void;
  /**
   * Mode école : la fiche saisie est rendue au parent sans jamais toucher au
   * fichier clients de la boutique. Une démonstration ne laisse pas de traces.
   */
  localOnly?: boolean;
}

const TYPE_OPTIONS: Array<{ value: CustomerLike['type']; label: string }> = [
  { value: 'particulier', label: 'Particulier' },
  { value: 'professionnel', label: 'Professionnel' },
  { value: 'collectivite', label: 'Collectivité' },
  { value: 'association', label: 'Association' },
];

export default function CustomerFormModal({ customer, onClose, onSaved, localOnly }: Props) {
  const [type, setType] = useState<CustomerLike['type']>(customer?.type ?? 'particulier');
  const [firstName, setFirstName] = useState(customer?.first_name ?? '');
  const [lastName, setLastName] = useState(customer?.last_name ?? '');
  const [companyName, setCompanyName] = useState(customer?.company_name ?? '');
  const [email, setEmail] = useState(customer?.email ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [siret, setSiret] = useState(customer?.siret ?? '');
  const [siren, setSiren] = useState(customer?.siren ?? '');
  const [vat, setVat] = useState(customer?.vat_number ?? '');
  const [serviceCode, setServiceCode] = useState(customer?.public_service_code ?? '');
  const [commitmentNumber, setCommitmentNumber] = useState(customer?.commitment_number ?? '');
  const [line1, setLine1] = useState(customer?.address?.line1 ?? '');
  const [zip, setZip] = useState(customer?.address?.zip ?? '');
  const [city, setCity] = useState(customer?.address?.city ?? '');
  const [consentEmail, setConsentEmail] = useState(customer?.consent_email ?? false);
  const [consentSms, setConsentSms] = useState(customer?.consent_sms ?? false);
  const [notes, setNotes] = useState(customer?.internal_notes ?? '');
  const [loyaltyCode, setLoyaltyCode] = useState(customer?.loyalty_code ?? '');
  // Fidélité active par défaut ; décochable pour exclure ce client du calcul.
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(customer?.loyalty_enabled ?? true);
  const [discountPct, setDiscountPct] = useState<string>(
    customer?.default_discount_pct != null ? String(customer.default_discount_pct) : '',
  );
  const [paymentTerms, setPaymentTerms] = useState<string>(customer?.payment_terms ?? '');
  const [billingFrequency, setBillingFrequency] = useState<'manual' | 'monthly'>(customer?.billing_frequency ?? 'manual');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPro = type !== 'particulier';

  // iOS Safari : empêche la barre « Remplissage automatique / Contacts » de
  // s'afficher sur les champs (nom, email, téléphone, adresse) — jugée
  // gênante à la saisie. On désactive l'autofill sur tous les champs du
  // formulaire, y compris ceux affichés conditionnellement (pro). Dépend de
  // `type` pour couvrir les champs (dé)montés au changement de type.
  const formRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    formRef.current?.querySelectorAll('input, textarea').forEach((el) => {
      el.setAttribute('autocomplete', 'off');
      el.setAttribute('autocorrect', 'off');
      el.setAttribute('autocapitalize', 'off');
    });
  }, [type]);

  async function submit() {
    // Validation côté UI : un client doit au minimum avoir une identité
    // (nom + prénom pour un particulier, raison sociale pour les autres)
    // et un téléphone — pour pouvoir le rappeler / rattacher à une carte
    // cadeau / un compte client.
    if (isPro) {
      if (!companyName.trim()) { setError('Raison sociale obligatoire.'); return; }
    } else {
      if (!firstName.trim() || !lastName.trim()) {
        setError('Prénom et nom obligatoires.'); return;
      }
    }
    if (!phone.trim()) { setError('Téléphone obligatoire.'); return; }

    setSaving(true); setError(null);
    const payload = {
      type,
      first_name: firstName.trim() || null,
      last_name: lastName.trim() || null,
      company_name: companyName.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      siret: siret.trim() || null,
      siren: siren.trim() || null,
      vat_number: vat.trim() || null,
      public_service_code: serviceCode.trim() || null,
      commitment_number: commitmentNumber.trim() || null,
      address: { line1: line1.trim(), zip: zip.trim(), city: city.trim(), country: 'FR' },
      consent_email: consentEmail,
      consent_sms: consentSms,
      internal_notes: notes.trim() || null,
      loyalty_code: loyaltyCode.trim() || null,
      default_discount_pct: discountPct.trim() ? Number(discountPct) : null,
      loyalty_enabled: loyaltyEnabled,
      payment_terms: paymentTerms || null,
      billing_frequency: billingFrequency,
    };
    // Mode école : la fiche repart au parent sans requête. Rien n'entre dans
    // le fichier clients de la boutique.
    if (localOnly) {
      setSaving(false);
      onSaved(customer?.id ?? '', payload);
      return;
    }

    const url = customer ? `/api/customers/${customer.id}` : '/api/customers';
    const method = customer ? 'PATCH' : 'POST';
    const res = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      const msg = j.issues?.formErrors?.[0]
        ?? j.message
        ?? j.error
        ?? 'Erreur d\'enregistrement';
      setError(msg);
      return;
    }
    const j = await res.json();
    onSaved(customer?.id ?? j.id);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4 overflow-auto">
      <div ref={formRef} className="card w-full max-w-2xl lg:max-w-4xl p-6 my-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{customer ? 'Modifier le client' : 'Nouveau client'}</h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
        </div>

        {/* Type */}
        <div className="flex gap-1 mb-4 flex-wrap">
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setType(opt.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                type === opt.value ? 'accent-bar text-white border-transparent' : 'bg-white text-ink border-border hover:border-gray-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {!isPro ? (
            <>
              <Field label="Prénom *">
                <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </Field>
              <Field label="Nom *">
                <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </Field>
            </>
          ) : (
            <Field label="Raison sociale *" full>
              <input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </Field>
          )}

          <Field label="Email">
            <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Téléphone *">
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>

          {isPro && (
            <>
              <div className="col-span-2 -mb-1 mt-1">
                <div className="text-xs uppercase tracking-wider text-ink-soft">
                  Identification légale
                  <span className="ml-1 normal-case text-ink-soft/70">
                    — requise pour la facturation électronique
                  </span>
                </div>
              </div>
              <Field label="SIREN">
                <input className="input" value={siren}
                       onChange={(e) => setSiren(e.target.value.replace(/\s/g, ''))}
                       placeholder="9 chiffres" maxLength={11} />
              </Field>
              <Field label="SIRET">
                <input className="input" value={siret}
                       onChange={(e) => setSiret(e.target.value.replace(/\s/g, ''))}
                       placeholder="14 chiffres" maxLength={17} />
              </Field>
              <Field label="N° TVA intra." full>
                <input className="input" value={vat} onChange={(e) => setVat(e.target.value)}
                       placeholder="ex : FR 12 345678901" />
              </Field>

              {type === 'collectivite' && (
                <>
                  <div className="col-span-2 -mb-1 mt-1">
                    <div className="text-xs uppercase tracking-wider text-ink-soft">
                      Secteur public (Chorus Pro)
                    </div>
                  </div>
                  <Field label="Code service">
                    <input className="input" value={serviceCode}
                           onChange={(e) => setServiceCode(e.target.value)}
                           placeholder="ex : service destinataire" />
                  </Field>
                  <Field label="N° d'engagement">
                    <input className="input" value={commitmentNumber}
                           onChange={(e) => setCommitmentNumber(e.target.value)}
                           placeholder="bon de commande / engagement" />
                  </Field>
                </>
              )}
            </>
          )}

          <Field label="Adresse" full>
            <input className="input" value={line1} onChange={(e) => setLine1(e.target.value)}
                   placeholder="N°, rue" />
          </Field>
          <Field label="Code postal">
            <input className="input" value={zip} onChange={(e) => setZip(e.target.value)} />
          </Field>
          <Field label="Ville">
            <input className="input" value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>

          <Field label="N° carte de fidélité (optionnel)" full>
            <input
              className="input max-w-[280px]"
              value={loyaltyCode}
              onChange={(e) => setLoyaltyCode(e.target.value)}
              placeholder="ex : FL-001234 (scan possible)"
            />
            <p className="mt-1 text-xs text-ink-soft">
              Numéro de carte physique ou code scannable. Reconnu en caisse pour
              identifier rapidement le client.
            </p>
          </Field>
          <Field label="Fidélité" full>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={loyaltyEnabled}
                onChange={(e) => setLoyaltyEnabled(e.target.checked)}
              />
              Participe au programme de fidélité
            </label>
            <p className="mt-1 text-xs text-ink-soft">
              Coché par défaut. Décoché : les achats de ce client ne génèrent
              aucun point et aucun point n&apos;est utilisable pour lui.
            </p>
          </Field>
          <Field label="Remise systématique (%)" full>
            <input
              type="number" step="0.1" min={0} max={100}
              className="input max-w-[150px]"
              value={discountPct}
              onChange={(e) => setDiscountPct(e.target.value)}
              placeholder="0 = pas de remise"
            />
            <p className="mt-1 text-xs text-ink-soft">
              Si renseigné, cette remise s&apos;applique automatiquement à chaque ligne
              quand ce client est attaché à un ticket.
            </p>
          </Field>
          <Field label="Conditions de règlement (factures)" full>
            <select
              className="input max-w-[280px]"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
            >
              <option value="">Par défaut (réglage boutique)</option>
              {PAYMENT_TERMS.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
            <p className="mt-1 text-xs text-ink-soft">
              Condition appliquée aux factures de ce client (échéance calculée
              automatiquement). Sinon, la condition par défaut de la boutique s&apos;applique.
            </p>
          </Field>
          <Field label="Fréquence de facturation (en compte)" full>
            <select
              className="input max-w-[280px]"
              value={billingFrequency}
              onChange={(e) => setBillingFrequency(e.target.value as 'manual' | 'monthly')}
            >
              <option value="manual">À la demande</option>
              <option value="monthly">Mensuelle</option>
            </select>
            <p className="mt-1 text-xs text-ink-soft">
              « Mensuelle » : ce client est inclus quand tu cliques sur
              « Générer les factures mensuelles » (page Facturation). Une facture
              regroupe alors tous ses tickets « en compte » non facturés, avec
              ses conditions de règlement. Aucune génération automatique.
            </p>
          </Field>
          <Field label="Notes internes" full>
            <textarea className="input h-20" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>

          <div className="col-span-2 space-y-1 text-sm">
            <div className="text-xs uppercase tracking-wider text-ink-soft">Consentements RGPD</div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={consentEmail} onChange={(e) => setConsentEmail(e.target.checked)} />
              Accepte de recevoir des emails marketing
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={consentSms} onChange={(e) => setConsentSms(e.target.checked)} />
              Accepte de recevoir des SMS marketing
            </label>
          </div>
        </div>

        {error && <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">Annuler</button>
          <button disabled={saving} onClick={() => void submit()} className="btn-primary">
            {saving ? 'Enregistrement…' : (customer ? 'Enregistrer' : 'Créer le client')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <label className="text-sm font-medium text-ink-soft">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
