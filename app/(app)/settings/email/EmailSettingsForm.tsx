'use client';

import { useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';

interface State {
  enabled: boolean;
  sender_email: string;
  sender_name: string;
  auto_send_invoice: boolean;
  auto_send_receipt: boolean;
  api_key: string;          // saisie (vide = inchangé)
  api_key_masked: string;
  api_key_set: boolean;
}

export default function EmailSettingsForm({ canWrite }: { canWrite: boolean }) {
  const [s, setS] = useState<State | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    void fetch('/api/settings/email')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j) setS({ ...j.settings, api_key: '' }); });
  }, []);

  function patch<K extends keyof State>(k: K, v: State[K]) {
    setS((cur) => (cur ? { ...cur, [k]: v } : cur));
  }

  async function save() {
    if (!s) return;
    setSaving(true); setMsg(null); setErr(null);
    const r = await fetch('/api/settings/email', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: s.enabled,
        sender_email: s.sender_email,
        sender_name: s.sender_name,
        auto_send_invoice: s.auto_send_invoice,
        auto_send_receipt: s.auto_send_receipt,
        api_key: s.api_key,               // vide = inchangé
      }),
    });
    setSaving(false);
    if (r.ok) {
      setMsg('Enregistré.');
      // Recharge l'état masqué + reset la saisie clé.
      const j = await (await fetch('/api/settings/email')).json();
      setS({ ...j.settings, api_key: '' });
      setTimeout(() => setMsg(null), 2500);
    } else {
      const j = await r.json().catch(() => null);
      setErr(j?.error ?? 'Échec de l’enregistrement.');
    }
  }

  async function sendTest() {
    if (!testTo) return;
    setTesting(true); setMsg(null); setErr(null);
    const r = await fetch('/api/settings/email', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test_to: testTo }),
    });
    setTesting(false);
    if (r.ok) { setMsg(`Email de test envoyé à ${testTo}.`); }
    else {
      const j = await r.json().catch(() => null);
      setErr(j?.detail ? `Échec : ${j.detail}` : 'Échec de l’envoi de test (vérifie la clé et l’expéditeur, et enregistre avant de tester).');
    }
  }

  if (!s) return <div className="p-8 text-sm text-ink-soft">Chargement…</div>;

  return (
    <div className="p-6 md:p-8 max-w-2xl space-y-5">
      <PageHeader
        title="Envoi d'emails (Brevo)"
        subtitle="Configurez l'envoi automatique des factures, tickets et documents par email via Brevo."
        actions={null}
      />

      <div className="card p-5 space-y-4">
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={s.enabled} disabled={!canWrite}
                 onChange={(e) => patch('enabled', e.target.checked)} />
          <span className="font-medium">Activer l'envoi d'emails</span>
        </label>

        <label className="block text-sm">
          <span className="text-ink-soft">Clé API Brevo (v3)</span>
          <input
            className="input h-10 w-full mt-1" type="password" disabled={!canWrite}
            placeholder={s.api_key_set ? `Définie (${s.api_key_masked}) — laisser vide pour conserver` : 'xkeysib-…'}
            value={s.api_key} onChange={(e) => patch('api_key', e.target.value)}
          />
          <span className="text-xs text-ink-soft">
            Brevo → Paramètres → Clés API (SMTP &amp; API) → créer une clé « API v3 ».
          </span>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-ink-soft">Email expéditeur</span>
            <input className="input h-10 w-full mt-1" type="email" disabled={!canWrite}
                   placeholder="contact@fannyfleurs.com"
                   value={s.sender_email} onChange={(e) => patch('sender_email', e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="text-ink-soft">Nom expéditeur</span>
            <input className="input h-10 w-full mt-1" disabled={!canWrite}
                   placeholder="Fanny Fleurs"
                   value={s.sender_name} onChange={(e) => patch('sender_name', e.target.value)} />
          </label>
        </div>
        <p className="text-xs text-ink-soft">
          L'email expéditeur doit être un <strong>expéditeur vérifié</strong> dans Brevo (Expéditeurs &amp; domaines).
        </p>

        <div className="pt-2 border-t border-border space-y-2">
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={s.auto_send_invoice} disabled={!canWrite}
                   onChange={(e) => patch('auto_send_invoice', e.target.checked)} />
            Envoyer automatiquement la facture par email dès sa génération
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={s.auto_send_receipt} disabled={!canWrite}
                   onChange={(e) => patch('auto_send_receipt', e.target.checked)} />
            Envoyer automatiquement le ticket si le client a une adresse email
          </label>
        </div>

        {msg && <p className="text-sm text-success">{msg}</p>}
        {err && <p className="text-sm text-danger">{err}</p>}

        {canWrite && (
          <button className="btn-primary h-10 px-4" disabled={saving} onClick={() => void save()}>
            {saving ? '…' : 'Enregistrer'}
          </button>
        )}
      </div>

      {canWrite && (
        <div className="card p-5 space-y-3">
          <h3 className="font-semibold">Test d'envoi</h3>
          <p className="text-xs text-ink-soft">Enregistre d'abord la configuration, puis envoie-toi un email de test.</p>
          <div className="flex gap-2">
            <input className="input h-10 flex-1" type="email" placeholder="mon-email@exemple.com"
                   value={testTo} onChange={(e) => setTestTo(e.target.value)} />
            <button className="btn-soft h-10 px-4" disabled={testing || !testTo} onClick={() => void sendTest()}>
              {testing ? '…' : 'Envoyer un test'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
