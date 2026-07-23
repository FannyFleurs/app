'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import BrandMark, { useBrand } from '@/components/BrandMark';

interface TaxRow { code: string; label: string; rate: number; is_default: boolean }

interface FormState {
  // Step 1
  company_name: string;
  company_legal: string;
  company_siret: string;
  company_vat: string;
  company_addr1: string;
  company_zip: string;
  company_city: string;
  company_phone: string;
  company_email: string;
  // Step 2
  store_code: string;
  store_name: string;
  // Step 3
  register_code: string;
  register_name: string;
  // Step 4
  taxes: TaxRow[];
  // Step 5
  admin_name: string;
  admin_email: string;
  admin_pin: string;
  admin_password: string;
  admin_password_confirm: string;
  // Offre choisie
  plan: 'essentiel' | 'croissance';
}

const PLANS = [
  { key: 'essentiel' as const, name: 'Essentiel', desc: '1 boutique · 1 caisse' },
  { key: 'croissance' as const, name: 'Croissance', desc: 'Caisses illimitées · multi-postes' },
];

const STEPS = [
  { key: 'company',  label: 'Société' },
  { key: 'store',    label: 'Boutique' },
  { key: 'register', label: 'Caisse' },
  { key: 'tax',      label: 'TVA' },
  { key: 'admin',    label: 'Administrateur' },
  { key: 'recap',    label: 'Récapitulatif' },
  { key: 'payment',  label: 'Paiement' },
] as const;

const DEFAULT_TAXES: TaxRow[] = [
  { code: 'TVA20', label: 'TVA 20% (taux normal)',     rate: 20,  is_default: false },
  { code: 'TVA10', label: 'TVA 10% (fleurs coupées)',  rate: 10,  is_default: true },
  { code: 'TVA55', label: 'TVA 5,5% (produits réduits)', rate: 5.5, is_default: false },
];

export default function SetupWizard() {
  const router = useRouter();
  const brand = useBrand();
  const [step, setStep] = useState<typeof STEPS[number]['key']>('company');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ email: string } | null>(null);

  const [f, setF] = useState<FormState>({
    company_name: '',
    company_legal: '',
    company_siret: '',
    company_vat: '',
    company_addr1: '',
    company_zip: '',
    company_city: '',
    company_phone: '',
    company_email: '',
    store_code: 'BOUT-01',
    store_name: 'Boutique principale',
    register_code: 'CAISSE-01',
    register_name: 'Caisse principale',
    taxes: DEFAULT_TAXES,
    admin_name: '',
    admin_email: '',
    admin_pin: '',
    admin_password: '',
    admin_password_confirm: '',
    plan: 'croissance',
  });

  // Mode multi-tenant : pas de check global, on autorise toujours la création.

  function patch<K extends keyof FormState>(k: K, v: FormState[K]) {
    setF((s) => ({ ...s, [k]: v }));
  }

  function patchTax(idx: number, k: keyof TaxRow, v: string | number | boolean) {
    setF((s) => ({
      ...s,
      taxes: s.taxes.map((t, i) => i === idx ? { ...t, [k]: v } : (
        k === 'is_default' && v ? { ...t, is_default: false } : t
      )),
    }));
  }

  function addTax() {
    setF((s) => ({ ...s, taxes: [...s.taxes, { code: '', label: '', rate: 0, is_default: false }] }));
  }

  function removeTax(idx: number) {
    setF((s) => ({ ...s, taxes: s.taxes.filter((_, i) => i !== idx) }));
  }

  function canAdvance(): boolean {
    switch (step) {
      case 'company':  return f.company_name.trim().length > 0 && f.company_legal.trim().length > 0;
      case 'store':    return f.store_code.trim().length > 0 && f.store_name.trim().length > 0;
      case 'register': return f.register_code.trim().length > 0 && f.register_name.trim().length > 0;
      case 'tax':      return f.taxes.length > 0 && f.taxes.every((t) => t.code && t.label && t.rate >= 0);
      case 'admin':    return f.admin_name.trim().length > 0
                            && f.admin_password === f.admin_password_confirm
                            && /^[^@]+@[^@]+\.[^@]+$/.test(f.admin_email)
                            && /^\d{4}$/.test(f.admin_pin)
                            && f.admin_password.length >= 8;
      default:         return true;
    }
  }

  function next() {
    const idx = STEPS.findIndex((s) => s.key === step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]!.key);
  }
  function prev() {
    const idx = STEPS.findIndex((s) => s.key === step);
    if (idx > 0) setStep(STEPS[idx - 1]!.key);
  }

  async function submit() {
    setBusy(true); setError(null);
    const r = await fetch('/api/auth/setup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company: {
          name: f.company_name.trim(),
          legal_name: f.company_legal.trim(),
          siret: f.company_siret.trim() || undefined,
          vat_number: f.company_vat.trim() || undefined,
          address_line1: f.company_addr1.trim() || undefined,
          address_zip: f.company_zip.trim() || undefined,
          address_city: f.company_city.trim() || undefined,
          phone: f.company_phone.trim() || undefined,
          email: f.company_email.trim() || undefined,
        },
        store: { code: f.store_code.trim().toUpperCase(), name: f.store_name.trim() },
        register: { code: f.register_code.trim().toUpperCase(), name: f.register_name.trim() },
        admin: {
          email: f.admin_email.trim().toLowerCase(),
          full_name: f.admin_name.trim(),
          pin: f.admin_pin,
          password: f.admin_password,
        },
        tax_rates: f.taxes.map((t) => ({
          code: t.code.toUpperCase(),
          label: t.label,
          rate: t.rate,
          is_default: t.is_default,
        })),
        plan: f.plan,
      }),
    });
    if (!r.ok) {
      setBusy(false);
      const j = await r.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Erreur');
      return;
    }
    const j = await r.json();
    // Paiement Stripe requis : on redirige vers le Checkout (on garde
    // busy=true, la page va changer).
    if (j.checkout_url) {
      window.location.assign(j.checkout_url);
      return;
    }
    // Fallback (Stripe non configuré) : compte créé + connecté.
    setBusy(false);
    setSuccess({ email: j.email });
  }

  if (success) {
    return (
      <main className="h-screen grid place-items-center bg-white p-6">
        <div className="card max-w-md w-full p-6 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-success/10 text-success text-2xl">✓</div>
          <h1 className="text-2xl font-semibold">Bienvenue sur HelloPos !</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Votre boutique est créée et vous êtes déjà connecté. 14 jours
            d&apos;essai gratuit pour tester la solution.
          </p>
          <div className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-sm">
            <div className="text-ink-soft text-xs">Email administrateur</div>
            <div className="font-medium">{success.email}</div>
          </div>
          <button onClick={() => router.push('/caisse')} className="btn-primary mt-4 w-full">
            Accéder à ma caisse
          </button>
          <button onClick={() => router.push('/settings/company')} className="btn-ghost mt-2 w-full text-sm">
            Configurer mon profil
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg">
      <div className="max-w-3xl mx-auto p-6 sm:p-10">
        <header className="flex items-center gap-3 mb-6">
          <BrandMark size={44} showName={false} />
          <div>
            <div className="text-xl font-semibold tracking-tight">{brand.brand_name || 'HelloPos'} — Configuration</div>
            <div className="text-xs text-ink-soft">Configurez votre installation en quelques minutes.</div>
          </div>
        </header>

        {/* Stepper */}
        <ol className="mb-6 flex flex-wrap gap-x-4 gap-y-2">
          {STEPS.map((s, i) => {
            const idx = STEPS.findIndex((x) => x.key === step);
            const active = s.key === step;
            const done = i < idx;
            return (
              <li key={s.key} className="flex items-center gap-2 text-xs">
                <span className={`h-7 w-7 shrink-0 rounded-full grid place-items-center text-[11px] font-semibold ${
                  active ? 'text-white' : done ? 'bg-success/15 text-success' : 'bg-gray-100 text-ink-soft'
                }`}
                  style={active ? { backgroundColor: 'var(--primary)' } : undefined}>
                  {done ? '✓' : i + 1}
                </span>
                <span className={`whitespace-nowrap ${active ? 'text-ink font-medium' : 'text-ink-soft'}`}>
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="card p-6">
          {step === 'company' && (
            <div className="space-y-4">
              <SectionHeader title="Société" subtitle="Renseignez les informations légales et de contact." />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Nom commercial *">
                  <input className="input" value={f.company_name}
                         onChange={(e) => patch('company_name', e.target.value)}
                         placeholder="HelloPos Fleurs" />
                </Field>
                <Field label="Raison sociale *">
                  <input className="input" value={f.company_legal}
                         onChange={(e) => patch('company_legal', e.target.value)}
                         placeholder="SARL HelloPos" />
                </Field>
                <Field label="SIRET">
                  <input className="input" value={f.company_siret} maxLength={14}
                         onChange={(e) => patch('company_siret', e.target.value)} />
                </Field>
                <Field label="N° TVA intra.">
                  <input className="input" value={f.company_vat}
                         onChange={(e) => patch('company_vat', e.target.value)}
                         placeholder="FR12 345 678 901" />
                </Field>
                <Field label="Adresse" full>
                  <input className="input" value={f.company_addr1}
                         onChange={(e) => patch('company_addr1', e.target.value)}
                         placeholder="N°, rue" />
                </Field>
                <Field label="Code postal">
                  <input className="input" value={f.company_zip}
                         onChange={(e) => patch('company_zip', e.target.value)} />
                </Field>
                <Field label="Ville">
                  <input className="input" value={f.company_city}
                         onChange={(e) => patch('company_city', e.target.value)} />
                </Field>
                <Field label="Téléphone">
                  <input className="input" value={f.company_phone}
                         onChange={(e) => patch('company_phone', e.target.value)} />
                </Field>
                <Field label="Email">
                  <input type="email" className="input" value={f.company_email}
                         onChange={(e) => patch('company_email', e.target.value)} />
                </Field>
              </div>
            </div>
          )}

          {step === 'store' && (
            <div className="space-y-4">
              <SectionHeader title="Boutique" subtitle="Votre premier point de vente. Vous pourrez en ajouter d'autres après." />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Code court *">
                  <input className="input" value={f.store_code} maxLength={20}
                         onChange={(e) => patch('store_code', e.target.value.toUpperCase())} />
                </Field>
                <Field label="Nom *">
                  <input className="input" value={f.store_name}
                         onChange={(e) => patch('store_name', e.target.value)} />
                </Field>
              </div>
            </div>
          )}

          {step === 'register' && (
            <div className="space-y-4">
              <SectionHeader title="Caisse" subtitle="Votre première caisse physique sur cette boutique." />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Code court *">
                  <input className="input" value={f.register_code} maxLength={20}
                         onChange={(e) => patch('register_code', e.target.value.toUpperCase())} />
                </Field>
                <Field label="Nom *">
                  <input className="input" value={f.register_name}
                         onChange={(e) => patch('register_name', e.target.value)} />
                </Field>
              </div>
            </div>
          )}

          {step === 'tax' && (
            <div className="space-y-3">
              <SectionHeader title="Taux de TVA" subtitle="Au moins un taux est requis. Vous pourrez en ajouter ou en modifier après." />
              {f.taxes.map((t, i) => (
                <div key={i} className="rounded-xl border border-border p-3 grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                  <div className="md:col-span-2">
                    <label className="text-xs font-medium text-ink-soft">Code</label>
                    <input className="input mt-1" value={t.code}
                           onChange={(e) => patchTax(i, 'code', e.target.value.toUpperCase())}
                           placeholder="TVA20" />
                  </div>
                  <div className="md:col-span-6">
                    <label className="text-xs font-medium text-ink-soft">Libellé</label>
                    <input className="input mt-1" value={t.label}
                           onChange={(e) => patchTax(i, 'label', e.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-medium text-ink-soft">Taux (%)</label>
                    <input type="number" step="0.1" min={0} max={100}
                           className="input mt-1" value={t.rate}
                           onChange={(e) => patchTax(i, 'rate', Number(e.target.value) || 0)} />
                  </div>
                  <div className="md:col-span-2 flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs">
                      <input type="radio" name="default-tax" checked={t.is_default}
                             onChange={(e) => patchTax(i, 'is_default', e.target.checked)} />
                      Défaut
                    </label>
                    {f.taxes.length > 1 && (
                      <button onClick={() => removeTax(i)} className="ml-auto text-ink-soft hover:text-danger text-sm">✕</button>
                    )}
                  </div>
                </div>
              ))}
              <button onClick={addTax} className="btn-soft text-sm" disabled={f.taxes.length >= 10}>
                + Ajouter un taux
              </button>
            </div>
          )}

          {step === 'admin' && (
            <div className="space-y-4">
              <SectionHeader title="Compte administrateur" subtitle="Ce compte aura tous les droits pour configurer l'application." />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Nom complet *">
                  <input className="input" value={f.admin_name}
                         onChange={(e) => patch('admin_name', e.target.value)} />
                </Field>
                <Field label="Email *">
                  <input type="email" className="input" value={f.admin_email}
                         onChange={(e) => patch('admin_email', e.target.value)} />
                </Field>
                <Field label="Mot de passe (8 caractères min.) *">
                  <input
                    type="password"
                    className="input"
                    value={f.admin_password}
                    onChange={(e) => patch('admin_password', e.target.value)}
                    autoComplete="new-password"
                  />
                  <p className="mt-1 text-xs text-ink-soft">
                    Sert à la connexion email + mot de passe (back-office, CA).
                  </p>
                </Field>
                <Field label="Confirmer le mot de passe *">
                  <input
                    type="password"
                    className="input"
                    value={f.admin_password_confirm}
                    onChange={(e) => patch('admin_password_confirm', e.target.value)}
                    autoComplete="new-password"
                  />
                  {f.admin_password_confirm.length > 0 && f.admin_password !== f.admin_password_confirm && (
                    <p className="mt-1 text-xs text-danger">Les mots de passe ne correspondent pas.</p>
                  )}
                </Field>
                <Field label="PIN (4 chiffres) *">
                  <input
                    inputMode="numeric"
                    className="input max-w-[160px] text-2xl tracking-[0.5em] tabular-nums"
                    value={f.admin_pin}
                    maxLength={4}
                    onChange={(e) => patch('admin_pin', e.target.value.replace(/\D/g, '').slice(0, 4))}
                  />
                  <p className="mt-1 text-xs text-ink-soft">
                    Connexion rapide en caisse. Modifiable ensuite.
                  </p>
                </Field>
              </div>
            </div>
          )}

          {step === 'recap' && (
            <div className="space-y-4">
              <SectionHeader title="Vérification" subtitle="Vérifiez le résumé avant de finaliser." />
              <RecapBlock title="Société" items={[
                ['Nom', f.company_name], ['Raison sociale', f.company_legal],
                ['SIRET', f.company_siret || '—'], ['TVA', f.company_vat || '—'],
                ['Adresse', [f.company_addr1, f.company_zip, f.company_city].filter(Boolean).join(', ') || '—'],
                ['Contact', [f.company_phone, f.company_email].filter(Boolean).join(' · ') || '—'],
              ]} />
              <RecapBlock title="Boutique" items={[['Code', f.store_code], ['Nom', f.store_name]]} />
              <RecapBlock title="Caisse" items={[['Code', f.register_code], ['Nom', f.register_name]]} />
              <RecapBlock title="TVA" items={f.taxes.map((t) => [
                `${t.code} (${t.rate}%)`,
                t.label + (t.is_default ? ' · défaut' : ''),
              ])} />
              <RecapBlock title="Administrateur" items={[
                ['Nom', f.admin_name], ['Email', f.admin_email],
                ['Mot de passe', '•'.repeat(Math.min(f.admin_password.length, 12))],
                ['PIN', '••••'],
              ]} />
            </div>
          )}

          {step === 'payment' && (
            <div className="space-y-4">
              <SectionHeader title="Paiement" subtitle="Choisissez votre offre. 14 jours d'essai, débit à l'échéance." />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PLANS.map((p) => {
                  const price = p.key === 'croissance'
                    ? (brand.plan_croissance_price || '59')
                    : (brand.plan_essentiel_price || '29');
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => patch('plan', p.key)}
                      className={`rounded-xl border p-4 text-left transition ${
                        f.plan === p.key ? 'border-accent bg-accent-soft/40 ring-1 ring-accent' : 'border-border hover:border-accent'
                      }`}
                    >
                      <div className="font-semibold">{p.name}</div>
                      <div className="mt-1 flex items-baseline gap-1">
                        <span className="text-2xl font-semibold">{price}</span>
                        <span className="text-xs text-ink-soft">€ HT / mois</span>
                      </div>
                      <div className="mt-1 text-xs text-ink-soft">{p.desc}</div>
                    </button>
                  );
                })}
              </div>
              <div className="rounded-xl bg-gray-50 border border-border px-4 py-3 text-xs text-ink-soft">
                14 jours d&apos;essai gratuit. Votre carte est enregistrée à
                l&apos;étape suivante (Stripe sécurisé) mais n&apos;est débitée
                qu&apos;à la fin de l&apos;essai. Un code promo pourra être saisi
                sur la page de paiement. Résiliable à tout moment.
              </div>
              {error && <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button onClick={prev} disabled={step === STEPS[0]!.key} className="btn-ghost">
            ‹ Précédent
          </button>
          {step !== 'payment' ? (
            <button
              onClick={next}
              disabled={!canAdvance()}
              className="btn-primary"
            >
              Suivant ›
            </button>
          ) : (
            <button onClick={() => void submit()} disabled={busy} className="btn-primary h-12 px-6">
              {busy ? 'Redirection…' : 'Continuer vers le paiement ›'}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-ink-soft">{subtitle}</p>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'md:col-span-2' : ''}>
      <label className="text-xs font-medium text-ink-soft">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function RecapBlock({ title, items }: { title: string; items: Array<[string, string]> }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="text-xs uppercase tracking-widest text-ink-soft font-semibold mb-2">{title}</div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {items.map(([k, v], i) => (
          <div key={i} className="flex items-baseline justify-between gap-3 border-b border-border/50 py-1 last:border-0">
            <dt className="text-ink-soft text-xs">{k}</dt>
            <dd className="font-medium text-right truncate">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
