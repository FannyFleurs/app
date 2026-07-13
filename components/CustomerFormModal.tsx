'use client';

import { useState } from 'react';

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
}

interface Props {
  customer?: CustomerLike | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}

const TYPE_OPTIONS: Array<{ value: CustomerLike['type']; label: string }> = [
  { value: 'particulier', label: 'Particulier' },
  { value: 'professionnel', label: 'Professionnel' },
  { value: 'collectivite', label: 'Collectivité' },
  { value: 'association', label: 'Association' },
];

export default function CustomerFormModal({ customer, onClose, onSaved }: Props) {
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
  const [discountPct, setDiscountPct] = useState<string>(
    customer?.default_discount_pct != null ? String(customer.default_discount_pct) : '',
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPro = type !== 'particulier';

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
    };
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
      <div className="card w-full max-w-2xl lg:max-w-4xl p-6 my-8">
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
