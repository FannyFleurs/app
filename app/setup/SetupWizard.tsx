'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import BrandMark, { useBrand } from '@/components/BrandMark';

interface TaxRow {
  code: string;
  label: string;
  rate: number;
  is_default: boolean;
}

interface FormState {
  company_name: string;
  company_legal: string;
  company_siret: string;
  company_vat: string;
  company_addr1: string;
  company_zip: string;
  company_city: string;
  company_phone: string;
  company_email: string;
  store_code: string;
  store_name: string;
  register_code: string;
  register_name: string;
  taxes: TaxRow[];
  admin_name: string;
  admin_email: string;
  admin_pin: string;
  admin_password: string;
  admin_password_confirm: string;
  plan: 'essentiel' | 'croissance' | 'reseau';
}

const PLANS = [
  { key: 'essentiel' as const, name: 'Essentiel', desc: '1 boutique · 1 caisse' },
  { key: 'croissance' as const, name: 'Croissance', desc: '1 boutique · jusqu’à 5 caisses' },
  { key: 'reseau' as const, name: 'Réseau', desc: 'Jusqu’à 3 boutiques · multi-caisses' },
];

const STEPS = [
  { key: 'email', label: 'Email' },
  { key: 'company', label: 'Société' },
  { key: 'store', label: 'Boutique' },
  { key: 'register', label: 'Caisse' },
  { key: 'tax', label: 'TVA' },
  { key: 'admin', label: 'Administrateur' },
  { key: 'recap', label: 'Récapitulatif' },
  { key: 'payment', label: 'Paiement' },
] as const;

const EMAIL_RE = /^[^@]+@[^@]+\.[^@]+$/;

const DEFAULT_TAXES: TaxRow[] = [
  { code: 'TVA20', label: 'TVA 20% (taux normal)', rate: 20, is_default: true },
  { code: 'TVA10', label: 'TVA 10% (taux intermédiaire)', rate: 10, is_default: false },
  { code: 'TVA55', label: 'TVA 5,5% (produits réduits)', rate: 5.5, is_default: false },
];

export default function SetupWizard() {
  const router = useRouter();
  const brand = useBrand();

  const [step, setStep] = useState<(typeof STEPS)[number]['key']>('email');
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

  const stepIndex = useMemo(() => STEPS.findIndex((s) => s.key === step), [step]);
  const currentStep = STEPS[stepIndex];
  const progress = Math.round(((stepIndex + 1) / STEPS.length) * 100);

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setF((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const offer = new URLSearchParams(window.location.search).get('offre');

    if (offer === 'essentiel' || offer === 'croissance' || offer === 'reseau') {
      setF((prev) => ({ ...prev, plan: offer }));
    }
  }, []);

  function patchTax(index: number, key: keyof TaxRow, value: string | number | boolean) {
    setF((prev) => ({
      ...prev,
      taxes: prev.taxes.map((tax, i) =>
        i === index
          ? { ...tax, [key]: value }
          : key === 'is_default' && value
            ? { ...tax, is_default: false }
            : tax
      ),
    }));
  }

  function addTax() {
    setF((prev) => ({
      ...prev,
      taxes: [...prev.taxes, { code: '', label: '', rate: 0, is_default: false }],
    }));
  }

  function removeTax(index: number) {
    setF((prev) => ({
      ...prev,
      taxes: prev.taxes.filter((_, i) => i !== index),
    }));
  }

  function canAdvance(): boolean {
    switch (step) {
      case 'email':
        return EMAIL_RE.test(f.admin_email.trim());
      case 'company':
        return f.company_name.trim().length > 0 && f.company_legal.trim().length > 0;
      case 'store':
        return f.store_code.trim().length > 0 && f.store_name.trim().length > 0;
      case 'register':
        return f.register_code.trim().length > 0 && f.register_name.trim().length > 0;
      case 'tax':
        return f.taxes.length > 0 && f.taxes.every((t) => t.code && t.label && t.rate >= 0);
      case 'admin':
        return (
          f.admin_name.trim().length > 0 &&
          f.admin_password === f.admin_password_confirm &&
          EMAIL_RE.test(f.admin_email) &&
          /^\d{4}$/.test(f.admin_pin) &&
          f.admin_password.length >= 8
        );
      default:
        return true;
    }
  }

  function next() {
    if (stepIndex < STEPS.length - 1) setStep(STEPS[stepIndex + 1]!.key);
  }

  function prev() {
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1]!.key);
  }

  async function submit() {
    setBusy(true);
    setError(null);

    const response = await fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
        store: {
          code: f.store_code.trim().toUpperCase(),
          name: f.store_name.trim(),
        },
        register: {
          code: f.register_code.trim().toUpperCase(),
          name: f.register_name.trim(),
        },
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

    if (!response.ok) {
      setBusy(false);
      const data = await response.json().catch(() => ({}));
      setError(data.message ?? data.error ?? 'Erreur');
      return;
    }

    const data = await response.json();

    if (data.checkout_url) {
      window.location.assign(data.checkout_url);
      return;
    }

    setBusy(false);
    setSuccess({ email: data.email });
  }

  if (success) {
    return (
      <main className="min-h-dvh bg-[#fbfaf6] px-4 py-8 sm:px-6 sm:py-12">
        <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-lg items-center justify-center">
          <section className="w-full rounded-[30px] border border-black/[0.05] bg-white p-6 text-center shadow-[0_24px_80px_rgba(1,62,55,0.08)] sm:p-8">
            <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-[#fff2bd] text-2xl text-[#013e37]">
              ✓
            </div>
            <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[#013e37]">
              Votre caisse est prête
            </h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#66736f]">
              Votre boutique HelloPos a bien été créée. Vous êtes déjà connecté et pouvez commencer la configuration.
            </p>

            <div className="mt-6 rounded-2xl bg-[#f7f7f3] px-4 py-3">
              <div className="text-xs text-[#78827f]">Email administrateur</div>
              <div className="mt-1 font-medium text-[#193f39]">{success.email}</div>
            </div>

            <button
              onClick={() => router.push('/caisse')}
              className="mt-6 h-14 w-full rounded-2xl bg-[#0b5a4f] px-5 font-semibold text-white transition hover:bg-[#084d44] active:scale-[0.99]"
            >
              Accéder à ma caisse
            </button>

            <button
              onClick={() => router.push('/settings/company')}
              className="mt-3 h-12 w-full rounded-2xl px-5 text-sm font-medium text-[#0b5a4f] transition hover:bg-[#f3f6f4]"
            >
              Configurer mon profil
            </button>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-[#fbfaf6] text-[#153d36]">
      <div className="mx-auto w-full max-w-[920px] px-4 py-5 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        <header className="mx-auto mb-6 max-w-2xl text-center sm:mb-8">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-[22px] bg-[#fff0b0] shadow-[0_12px_35px_rgba(1,62,55,0.06)] sm:h-[72px] sm:w-[72px]">
            <BrandMark size={46} showName={false} />
          </div>

          <h1 className="mt-5 text-[28px] font-semibold leading-tight tracking-[-0.04em] text-[#013e37] sm:text-4xl">
            Créons votre caisse
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#6d7572] sm:text-base">
            Quelques informations suffisent pour préparer votre boutique et votre première caisse.
          </p>
        </header>

        <section className="overflow-hidden rounded-[28px] border border-black/[0.055] bg-white shadow-[0_20px_70px_rgba(1,62,55,0.075)] sm:rounded-[32px]">
          <div className="border-b border-black/[0.055] bg-[#fffdf8] px-5 py-5 sm:px-8 sm:py-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a928f]">
                  Configuration HelloPos
                </div>
                <div className="mt-1 text-base font-semibold text-[#173f38] sm:text-lg">
                  {currentStep?.label}
                </div>
              </div>

              <div className="shrink-0 rounded-full bg-[#f1f4f1] px-3 py-1.5 text-xs font-semibold text-[#5f6d68]">
                {stepIndex + 1}/{STEPS.length}
              </div>
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#edf0ed]">
              <div
                className="h-full rounded-full bg-[#0b5a4f] transition-[width] duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>

            <ol className="mt-4 hidden grid-cols-8 gap-2 sm:grid">
              {STEPS.map((item, index) => {
                const active = index === stepIndex;
                const done = index < stepIndex;

                return (
                  <li key={item.key} className="text-center">
                    <div
                      className={[
                        'mx-auto grid h-7 w-7 place-items-center rounded-full text-[11px] font-semibold transition',
                        active
                          ? 'bg-[#0b5a4f] text-white'
                          : done
                            ? 'bg-[#dfeee8] text-[#0b5a4f]'
                            : 'bg-[#f1f2ef] text-[#909692]',
                      ].join(' ')}
                    >
                      {done ? '✓' : index + 1}
                    </div>
                    <div
                      className={[
                        'mt-1.5 truncate text-[10px]',
                        active ? 'font-semibold text-[#0b5a4f]' : 'text-[#9a9f9c]',
                      ].join(' ')}
                    >
                      {item.label}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="px-5 py-6 sm:px-8 sm:py-8">
            {step === 'email' && (
              <div className="space-y-5">
                <SectionHeader
                  title="Votre adresse email"
                  subtitle="Elle servira d’identifiant principal pour administrer votre caisse."
                />
                <Field label="Adresse email *">
                  <input
                    type="email"
                    className="setup-input"
                    value={f.admin_email}
                    onChange={(e) => patch('admin_email', e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && canAdvance()) next();
                    }}
                    placeholder="vous@votreboutique.fr"
                    autoComplete="email"
                    autoFocus
                  />
                </Field>

                <InfoBox>
                  Cette adresse sera utilisée pour la connexion administrateur et pour les informations importantes liées à votre compte.
                </InfoBox>
              </div>
            )}

            {step === 'company' && (
              <div className="space-y-5">
                <SectionHeader
                  title="Votre société"
                  subtitle="Renseignez les informations principales de votre entreprise."
                />

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="Nom commercial *">
                    <input
                      className="setup-input"
                      value={f.company_name}
                      onChange={(e) => patch('company_name', e.target.value)}
                      placeholder="Ma boutique"
                    />
                  </Field>

                  <Field label="Raison sociale *">
                    <input
                      className="setup-input"
                      value={f.company_legal}
                      onChange={(e) => patch('company_legal', e.target.value)}
                      placeholder="SARL Ma boutique"
                    />
                  </Field>

                  <Field label="SIRET">
                    <input
                      className="setup-input"
                      value={f.company_siret}
                      maxLength={14}
                      onChange={(e) => patch('company_siret', e.target.value)}
                    />
                  </Field>

                  <Field label="N° TVA intracommunautaire">
                    <input
                      className="setup-input"
                      value={f.company_vat}
                      onChange={(e) => patch('company_vat', e.target.value)}
                      placeholder="FR12 345 678 901"
                    />
                  </Field>

                  <Field label="Adresse" full>
                    <input
                      className="setup-input"
                      value={f.company_addr1}
                      onChange={(e) => patch('company_addr1', e.target.value)}
                      placeholder="N°, rue"
                    />
                  </Field>

                  <Field label="Code postal">
                    <input
                      className="setup-input"
                      value={f.company_zip}
                      onChange={(e) => patch('company_zip', e.target.value)}
                    />
                  </Field>

                  <Field label="Ville">
                    <input
                      className="setup-input"
                      value={f.company_city}
                      onChange={(e) => patch('company_city', e.target.value)}
                    />
                  </Field>

                  <Field label="Téléphone">
                    <input
                      className="setup-input"
                      value={f.company_phone}
                      onChange={(e) => patch('company_phone', e.target.value)}
                    />
                  </Field>

                  <Field label="Email société">
                    <input
                      type="email"
                      className="setup-input"
                      value={f.company_email}
                      onChange={(e) => patch('company_email', e.target.value)}
                    />
                  </Field>
                </div>
              </div>
            )}

            {step === 'store' && (
              <div className="space-y-5">
                <SectionHeader
                  title="Votre boutique"
                  subtitle="Créez votre premier point de vente. Vous pourrez en ajouter d’autres ensuite."
                />

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="Code boutique *">
                    <input
                      className="setup-input"
                      value={f.store_code}
                      maxLength={20}
                      onChange={(e) => patch('store_code', e.target.value.toUpperCase())}
                    />
                  </Field>

                  <Field label="Nom de la boutique *">
                    <input
                      className="setup-input"
                      value={f.store_name}
                      onChange={(e) => patch('store_name', e.target.value)}
                    />
                  </Field>
                </div>
              </div>
            )}

            {step === 'register' && (
              <div className="space-y-5">
                <SectionHeader
                  title="Votre première caisse"
                  subtitle="Identifiez la caisse installée sur ce point de vente."
                />

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="Code caisse *">
                    <input
                      className="setup-input"
                      value={f.register_code}
                      maxLength={20}
                      onChange={(e) => patch('register_code', e.target.value.toUpperCase())}
                    />
                  </Field>

                  <Field label="Nom de la caisse *">
                    <input
                      className="setup-input"
                      value={f.register_name}
                      onChange={(e) => patch('register_name', e.target.value)}
                    />
                  </Field>
                </div>
              </div>
            )}

            {step === 'tax' && (
              <div className="space-y-5">
                <SectionHeader
                  title="Taux de TVA"
                  subtitle="Les taux courants sont déjà ajoutés. Ajustez-les uniquement si nécessaire."
                />

                <div className="space-y-3">
                  {f.taxes.map((tax, index) => (
                    <div
                      key={index}
                      className="rounded-[22px] border border-black/[0.07] bg-[#fcfcf9] p-4"
                    >
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-end">
                        <div className="md:col-span-2">
                          <label className="setup-label">Code</label>
                          <input
                            className="setup-input mt-1.5"
                            value={tax.code}
                            onChange={(e) => patchTax(index, 'code', e.target.value.toUpperCase())}
                            placeholder="TVA20"
                          />
                        </div>

                        <div className="md:col-span-6">
                          <label className="setup-label">Libellé</label>
                          <input
                            className="setup-input mt-1.5"
                            value={tax.label}
                            onChange={(e) => patchTax(index, 'label', e.target.value)}
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="setup-label">Taux (%)</label>
                          <input
                            type="number"
                            step="0.1"
                            min={0}
                            max={100}
                            className="setup-input mt-1.5"
                            value={tax.rate}
                            onChange={(e) => patchTax(index, 'rate', Number(e.target.value) || 0)}
                          />
                        </div>

                        <div className="flex items-center gap-3 md:col-span-2 md:pb-2">
                          <label className="flex items-center gap-2 text-xs font-medium text-[#5f6b67]">
                            <input
                              type="radio"
                              name="default-tax"
                              checked={tax.is_default}
                              onChange={(e) => patchTax(index, 'is_default', e.target.checked)}
                              className="accent-[#0b5a4f]"
                            />
                            Défaut
                          </label>

                          {f.taxes.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeTax(index)}
                              className="ml-auto rounded-lg px-2 py-1 text-sm text-[#9b6767] hover:bg-[#fff3f3]"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={addTax}
                  disabled={f.taxes.length >= 10}
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-[#eef5f1] px-4 text-sm font-semibold text-[#0b5a4f] transition hover:bg-[#e5f0eb] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  + Ajouter un taux
                </button>
              </div>
            )}

            {step === 'admin' && (
              <div className="space-y-5">
                <SectionHeader
                  title="Compte administrateur"
                  subtitle="Ce compte aura tous les droits pour gérer HelloPos."
                />

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="Nom complet *">
                    <input
                      className="setup-input"
                      value={f.admin_name}
                      onChange={(e) => patch('admin_name', e.target.value)}
                    />
                  </Field>

                  <Field label="Email">
                    <input
                      type="email"
                      className="setup-input bg-[#f7f8f5] text-[#76807c]"
                      value={f.admin_email}
                      readOnly
                    />
                    <p className="mt-1.5 text-xs text-[#8a918e]">Saisi à la première étape.</p>
                  </Field>

                  <Field label="Mot de passe *">
                    <input
                      type="password"
                      className="setup-input"
                      value={f.admin_password}
                      onChange={(e) => patch('admin_password', e.target.value)}
                      autoComplete="new-password"
                    />
                    <p className="mt-1.5 text-xs text-[#8a918e]">8 caractères minimum.</p>
                  </Field>

                  <Field label="Confirmer le mot de passe *">
                    <input
                      type="password"
                      className="setup-input"
                      value={f.admin_password_confirm}
                      onChange={(e) => patch('admin_password_confirm', e.target.value)}
                      autoComplete="new-password"
                    />
                    {f.admin_password_confirm.length > 0 &&
                      f.admin_password !== f.admin_password_confirm && (
                        <p className="mt-1.5 text-xs text-[#a34f4f]">
                          Les mots de passe ne correspondent pas.
                        </p>
                      )}
                  </Field>

                  <Field label="Code PIN *">
                    <input
                      inputMode="numeric"
                      className="setup-input max-w-[190px] text-center text-2xl tracking-[0.45em] tabular-nums"
                      value={f.admin_pin}
                      maxLength={4}
                      onChange={(e) =>
                        patch('admin_pin', e.target.value.replace(/\D/g, '').slice(0, 4))
                      }
                    />
                    <p className="mt-1.5 text-xs text-[#8a918e]">
                      Utilisé pour la connexion rapide en caisse.
                    </p>
                  </Field>
                </div>
              </div>
            )}

            {step === 'recap' && (
              <div className="space-y-5">
                <SectionHeader
                  title="Vérification"
                  subtitle="Vérifiez les informations avant de choisir votre offre."
                />

                <div className="grid gap-3 md:grid-cols-2">
                  <RecapBlock
                    title="Société"
                    items={[
                      ['Nom', f.company_name],
                      ['Raison sociale', f.company_legal],
                      ['SIRET', f.company_siret || '—'],
                      ['TVA', f.company_vat || '—'],
                      [
                        'Adresse',
                        [f.company_addr1, f.company_zip, f.company_city]
                          .filter(Boolean)
                          .join(', ') || '—',
                      ],
                      [
                        'Contact',
                        [f.company_phone, f.company_email].filter(Boolean).join(' · ') || '—',
                      ],
                    ]}
                  />

                  <div className="space-y-3">
                    <RecapBlock
                      title="Boutique"
                      items={[
                        ['Code', f.store_code],
                        ['Nom', f.store_name],
                      ]}
                    />
                    <RecapBlock
                      title="Caisse"
                      items={[
                        ['Code', f.register_code],
                        ['Nom', f.register_name],
                      ]}
                    />
                  </div>

                  <RecapBlock
                    title="TVA"
                    items={f.taxes.map((t) => [
                      `${t.code} (${t.rate}%)`,
                      t.label + (t.is_default ? ' · défaut' : ''),
                    ])}
                  />

                  <RecapBlock
                    title="Administrateur"
                    items={[
                      ['Nom', f.admin_name],
                      ['Email', f.admin_email],
                      ['Mot de passe', '•'.repeat(Math.min(f.admin_password.length, 12))],
                      ['PIN', '••••'],
                    ]}
                  />
                </div>
              </div>
            )}

            {step === 'payment' && (
              <div className="space-y-5">
                <SectionHeader
                  title="Choisissez votre offre"
                  subtitle="14 jours d’essai gratuit. Aucun débit avant la fin de la période d’essai."
                />

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {PLANS.map((plan) => {
                    const price =
                      plan.key === 'reseau'
                        ? brand.plan_reseau_price || '69'
                        : plan.key === 'croissance'
                          ? brand.plan_croissance_price || '59'
                          : brand.plan_essentiel_price || '29';

                    const selected = f.plan === plan.key;

                    return (
                      <button
                        key={plan.key}
                        type="button"
                        onClick={() => patch('plan', plan.key)}
                        className={[
                          'relative rounded-[22px] border p-4 text-left transition',
                          selected
                            ? 'border-[#0b5a4f] bg-[#f0f7f3] shadow-[0_10px_28px_rgba(11,90,79,0.08)]'
                            : 'border-black/[0.075] bg-white hover:border-[#9dbbb1]',
                        ].join(' ')}
                      >
                        {selected && (
                          <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-[#0b5a4f] text-[11px] text-white">
                            ✓
                          </span>
                        )}

                        <div className="font-semibold text-[#143e37]">{plan.name}</div>
                        <div className="mt-3 flex items-end gap-1">
                          <span className="text-3xl font-semibold tracking-[-0.04em] text-[#013e37]">
                            {price}
                          </span>
                          <span className="pb-1 text-xs text-[#7a837f]">€ HT/mois</span>
                        </div>
                        <div className="mt-2 text-xs leading-5 text-[#737c78]">{plan.desc}</div>
                      </button>
                    );
                  })}
                </div>

                <InfoBox>
                  Votre carte bancaire est enregistrée via Stripe. Elle ne sera débitée qu’à la fin des 14 jours d’essai. Vous pourrez résilier à tout moment.
                </InfoBox>

                {error && (
                  <div className="rounded-2xl bg-[#fff1f1] px-4 py-3 text-sm text-[#9d4242]">
                    {error}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-black/[0.055] bg-[#fffdf8] px-5 py-4 sm:px-8 sm:py-5">
            <div className="flex items-center gap-3">
              {step !== STEPS[0]!.key && (
                <button
                  type="button"
                  onClick={prev}
                  className="h-12 shrink-0 rounded-2xl border border-black/[0.08] bg-white px-4 text-sm font-semibold text-[#53635e] transition hover:bg-[#f7f8f5] sm:px-5"
                >
                  ‹ Précédent
                </button>
              )}

              {step !== 'payment' ? (
                <button
                  type="button"
                  onClick={next}
                  disabled={!canAdvance()}
                  className="ml-auto h-12 min-w-[150px] flex-1 rounded-2xl bg-[#0b5a4f] px-5 text-sm font-semibold text-white transition hover:bg-[#084d44] active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-[#c9d3cf] sm:flex-none"
                >
                  Continuer
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={busy}
                  className="ml-auto h-12 flex-1 rounded-2xl bg-[#0b5a4f] px-5 text-sm font-semibold text-white transition hover:bg-[#084d44] active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-[#c9d3cf] sm:flex-none sm:min-w-[250px]"
                >
                  {busy ? 'Redirection…' : 'Continuer vers le paiement'}
                </button>
              )}
            </div>
          </div>
        </section>

        <div className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-[#89918e]">
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4 text-[#3b8b78]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M12 3 5.5 5.7v5.7c0 4.4 2.7 7.9 6.5 9.6 3.8-1.7 6.5-5.2 6.5-9.6V5.7L12 3Z" />
            <path d="m9.3 12 1.8 1.8 3.7-4" />
          </svg>
          <span>Données sécurisées et hébergées en France</span>
        </div>
      </div>

      <style jsx global>{`
        .setup-label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          color: #68736f;
        }

        .setup-input {
          width: 100%;
          min-height: 50px;
          border-radius: 14px;
          border: 1px solid rgba(22, 61, 54, 0.12);
          background: #fff;
          padding: 0 14px;
          color: #173f38;
          outline: none;
          transition:
            border-color 160ms ease,
            box-shadow 160ms ease,
            background-color 160ms ease;
        }

        .setup-input::placeholder {
          color: #a3aaa7;
        }

        .setup-input:focus {
          border-color: rgba(11, 90, 79, 0.72);
          box-shadow: 0 0 0 4px rgba(11, 90, 79, 0.08);
        }

        @media (max-width: 640px) {
          .setup-input {
            min-height: 52px;
            font-size: 16px;
          }
        }
      `}</style>
    </main>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-semibold tracking-[-0.025em] text-[#143e37] sm:text-2xl">
        {title}
      </h2>
      <p className="mt-1.5 text-sm leading-6 text-[#727c78]">{subtitle}</p>
    </div>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? 'md:col-span-2' : ''}>
      <label className="setup-label">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#e7ece8] bg-[#f7faf8] px-4 py-3 text-xs leading-5 text-[#687570]">
      {children}
    </div>
  );
}

function RecapBlock({
  title,
  items,
}: {
  title: string;
  items: Array<[string, string]>;
}) {
  return (
    <div className="rounded-[22px] border border-black/[0.07] bg-[#fcfcf9] p-4">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#88918d]">
        {title}
      </div>

      <dl className="space-y-2">
        {items.map(([key, value], index) => (
          <div
            key={`${key}-${index}`}
            className="flex items-start justify-between gap-4 border-b border-black/[0.05] pb-2 last:border-0 last:pb-0"
          >
            <dt className="text-xs text-[#7c8581]">{key}</dt>
            <dd className="max-w-[65%] break-words text-right text-sm font-medium text-[#244740]">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
