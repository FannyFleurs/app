'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';

interface Settings {
  enabled: boolean;
  ip: string;
  port: number;
  paper_width: 58 | 80;
  brand: string;
}

const DEFAULTS: Settings = {
  enabled: false,
  ip: '',
  port: 9100,
  paper_width: 80,
  brand: '',
};

export default function PrinterSettingsForm({ canWrite }: { canWrite: boolean }) {
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; ms?: number; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    void (async () => {
      const r = await fetch('/api/settings/printer');
      if (r.ok) setS((await r.json()).settings);
      setLoading(false);
    })();
  }, []);

  function patch<K extends keyof Settings>(k: K, v: Settings[K]) {
    setS((cur) => ({ ...cur, [k]: v }));
  }

  async function save() {
    setSaving(true); setError(null);
    const r = await fetch('/api/settings/printer', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(s),
    });
    setSaving(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Erreur');
      return;
    }
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2000);
  }

  async function test() {
    if (!s.ip) { setError('Renseignez l\'adresse IP avant de tester.'); return; }
    setTesting(true); setError(null); setTestResult(null);
    const r = await fetch('/api/settings/printer/test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip: s.ip, port: s.port }),
    });
    setTesting(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setTestResult({ ok: false, error: j.message ?? 'Erreur réseau' });
      return;
    }
    setTestResult(await r.json());
  }

  if (loading) return <div className="p-8 text-ink-soft">Chargement…</div>;

  return (
    <div className="p-6 md:p-8 space-y-5 max-w-3xl">
      <Link href="/settings" className="text-sm text-ink-soft hover:text-ink md:hidden">← Paramètres</Link>
      <PageHeader
        title="Imprimante ticket"
        subtitle="Connexion à une imprimante ESC/POS réseau (Epson, Star, Bixolon…). La config est enregistrée pour servir à l'impression depuis le navigateur."
        badge={!canWrite ? { label: 'Lecture seule pour votre rôle', tone: 'soft' } : undefined}
      />

      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-medium">Activer l&apos;impression réseau</div>
            <p className="text-xs text-ink-soft mt-0.5">
              Désactivé par défaut : les tickets s&apos;affichent en PDF dans le navigateur,
              à imprimer manuellement.
            </p>
          </div>
          <Toggle checked={s.enabled} disabled={!canWrite} onChange={(v) => patch('enabled', v)} />
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <h3 className="font-semibold">Imprimante</h3>

        <Field label="Marque / modèle (optionnel)">
          <input
            className="input"
            value={s.brand}
            onChange={(e) => patch('brand', e.target.value)}
            placeholder="ex : Epson TM-T20III"
            disabled={!canWrite || !s.enabled}
          />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_140px] gap-3">
          <Field label="Adresse IP *">
            <input
              className="input font-mono"
              value={s.ip}
              onChange={(e) => patch('ip', e.target.value.trim())}
              placeholder="ex : 192.168.1.50"
              disabled={!canWrite || !s.enabled}
            />
          </Field>
          <Field label="Port *">
            <input
              type="number" min={1} max={65535}
              className="input font-mono"
              value={s.port}
              onChange={(e) => patch('port', Number(e.target.value) || 9100)}
              disabled={!canWrite || !s.enabled}
            />
          </Field>
        </div>

        <Field label="Largeur du papier">
          <div className="grid grid-cols-2 gap-2 max-w-xs">
            {([58, 80] as const).map((w) => (
              <button
                key={w}
                type="button"
                disabled={!canWrite || !s.enabled}
                onClick={() => patch('paper_width', w)}
                className={`rounded-xl border py-2.5 text-sm font-semibold transition-colors ${
                  s.paper_width === w
                    ? 'accent-bar text-white border-transparent'
                    : 'bg-white border-border text-ink'
                }`}
              >
                {w} mm
              </button>
            ))}
          </div>
        </Field>

        <p className="text-xs text-ink-soft pt-3 border-t border-border">
          ℹ Les options « Imprimer auto après vente » et « Imprimer auto le Z »
          se règlent dans <strong>Paramétrage ticket</strong>.
        </p>

        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border">
          <button
            onClick={() => void test()}
            disabled={!s.enabled || !s.ip || testing}
            className="btn-soft text-sm"
          >
            {testing ? 'Test…' : 'Tester la connexion'}
          </button>
          {testResult && (
            <span className={`text-xs ${testResult.ok ? 'text-success' : 'text-danger'}`}>
              {testResult.ok
                ? `✓ Imprimante joignable (${testResult.ms} ms)`
                : `✗ ${testResult.error}`}
            </span>
          )}
        </div>
      </div>

      <div className="card p-5 bg-warning/10 border-warning/30">
        <h3 className="font-semibold text-warning text-sm">⚠ Notes techniques</h3>
        <ul className="mt-2 text-xs text-ink-soft space-y-1 list-disc list-inside">
          <li>
            <strong>Test depuis le serveur</strong> : le test tente une connexion TCP depuis
            les serveurs HelloPos (Frankfurt). Il échouera pour une IP de LAN privé
            (192.168.x.x, 10.x.x.x) — c&apos;est normal.
          </li>
          <li>
            <strong>Impression depuis l&apos;iPad</strong> : ajoutez l&apos;imprimante comme
            imprimante AirPrint dans Réglages iOS. Les tickets s&apos;impriment ensuite
            via le menu Partager → Imprimer.
          </li>
          <li>
            <strong>Impression directe via IP/ESC-POS</strong> : nécessite un pont local
            (à venir, app compagnon). La config IP/port saisie ici sera réutilisée
            automatiquement.
          </li>
        </ul>
      </div>

      {error && (
        <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={() => void save()}
          disabled={saving || !canWrite}
          className="btn-primary"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        {savedToast && (
          <span className="text-sm text-success">✓ Enregistré</span>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-ink-soft">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Toggle({ checked, disabled, onChange }: {
  checked: boolean; disabled?: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? 'bg-success' : 'bg-gray-300'
      }`}
      role="switch"
      aria-checked={checked}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
