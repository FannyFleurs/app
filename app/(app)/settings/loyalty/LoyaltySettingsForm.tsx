'use client';

import { useState } from 'react';
import type { PosUiSettings, LoyaltySettings, LoyaltyScope, WalletPassSettings } from '@/lib/settings/pos-ui';

interface StoreLite { id: string; name: string }

export default function LoyaltySettingsForm({ initial, canEdit, stores = [], scopeAvailable = false }: {
  initial: PosUiSettings; canEdit: boolean;
  stores?: StoreLite[];
  scopeAvailable?: boolean;
}) {
  const [loyalty, setLoyalty] = useState<LoyaltySettings>(initial.loyalty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function patch<K extends keyof LoyaltySettings>(k: K, v: LoyaltySettings[K]) {
    if (!canEdit) return;
    setLoyalty((s) => ({ ...s, [k]: v }));
  }

  function patchWallet<K extends keyof WalletPassSettings>(k: K, v: WalletPassSettings[K]) {
    if (!canEdit) return;
    setLoyalty((s) => ({ ...s, wallet: { ...s.wallet, [k]: v } }));
  }
  const wallet = loyalty.wallet;

  // Périmètre multi-boutiques.
  function setStoreGroup(storeId: string, group: string) {
    if (!canEdit) return;
    setLoyalty((s) => {
      const next = { ...(s.store_groups ?? {}) };
      const g = group.trim();
      if (g) next[storeId] = g;
      else delete next[storeId];
      return { ...s, store_groups: next };
    });
  }
  const scope: LoyaltyScope = loyalty.scope ?? 'shared';
  const showScope = stores.length >= 2;

  async function submit() {
    setSaving(true); setError(null); setSaved(false);
    const r = await fetch('/api/settings/pos', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loyalty }),
    });
    setSaving(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Erreur');
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fidélité</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Les remises de fidélité se déclenchent depuis la fiche client en caisse une
          fois le seuil atteint.
        </p>
      </div>

      <div className="card p-5 space-y-3">
        <label className="flex items-center justify-between gap-3 py-2 border-b border-border/60">
          <span className="text-sm font-medium">Programme activé</span>
          <input
            type="checkbox" className="h-5 w-5"
            checked={loyalty.enabled}
            disabled={!canEdit}
            onChange={(e) => patch('enabled', e.target.checked)}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-ink-soft">€ de fidélité gagnés</label>
            <input
              type="number" step="0.5" min={0}
              className="input mt-1"
              value={loyalty.euros_earned}
              disabled={!canEdit || !loyalty.enabled}
              onChange={(e) => patch('euros_earned', Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-soft">… tous les € dépensés</label>
            <input
              type="number" step="1" min={1}
              className="input mt-1"
              value={loyalty.per_euros_spent}
              disabled={!canEdit || !loyalty.enabled}
              onChange={(e) => patch('per_euros_spent', Number(e.target.value) || 1)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-soft">Seuil d&apos;utilisation minimum (€)</label>
            <input
              type="number" step="0.5" min={0}
              className="input mt-1"
              value={loyalty.min_redeem}
              disabled={!canEdit || !loyalty.enabled}
              onChange={(e) => patch('min_redeem', Number(e.target.value) || 0)}
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={loyalty.stackable}
                disabled={!canEdit || !loyalty.enabled}
                onChange={(e) => patch('stackable', e.target.checked)}
              />
              Cumulable avec d&apos;autres remises
            </label>
          </div>
        </div>
        {loyalty.enabled && (
          <p className="text-xs text-ink-soft">
            Règle actuelle : {loyalty.euros_earned} € gagnés tous les{' '}
            {loyalty.per_euros_spent} € dépensés. Utilisable à partir de{' '}
            {loyalty.min_redeem} € cumulés.
            {loyalty.stackable ? ' Cumulable avec d\'autres remises.' : ' Non cumulable.'}
          </p>
        )}
      </div>

      {/* -------- Périmètre multi-boutiques (Croissance+) -------- */}
      {showScope && (
        <div className="card p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold">Périmètre de la fidélité</h2>
            <p className="text-xs text-ink-soft mt-0.5">
              Choisissez si la carte de fidélité est commune à toutes vos
              boutiques ou séparée. Les comptes clients, eux, restent toujours
              communs.
            </p>
          </div>

          {!scopeAvailable ? (
            <div className="rounded-xl bg-warning/10 border border-warning/30 p-3 text-sm">
              La fidélité multi-boutiques est disponible à partir de l&apos;offre{' '}
              <strong>Croissance</strong>.{' '}
              <a href="/settings/subscription" className="underline text-accent-deep">Changer d&apos;offre</a>.
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <ScopeRadio
                  checked={scope === 'shared'} disabled={!canEdit}
                  onSelect={() => patch('scope', 'shared')}
                  title="Commune à toutes les boutiques"
                  desc="Une seule carte : les achats et les points se cumulent partout."
                />
                <ScopeRadio
                  checked={scope === 'per_store'} disabled={!canEdit}
                  onSelect={() => patch('scope', 'per_store')}
                  title="Chaque boutique la sienne"
                  desc="Solde de points séparé par boutique. Rien ne se cumule d'une boutique à l'autre."
                />
                <ScopeRadio
                  checked={scope === 'grouped'} disabled={!canEdit}
                  onSelect={() => patch('scope', 'grouped')}
                  title="Groupes personnalisés"
                  desc="Les boutiques d'un même groupe partagent la carte ; une boutique sans groupe a la sienne."
                />
              </div>

              {scope === 'grouped' && (
                <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
                  <div className="px-3 py-2 text-xs text-ink-soft bg-gray-50">
                    Donnez le même nom de groupe aux boutiques qui doivent
                    partager la même carte.
                  </div>
                  {stores.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="flex-1 min-w-0 truncate text-sm font-medium">{s.name}</div>
                      <input
                        className="input h-9 max-w-[180px] text-sm"
                        placeholder="Groupe (ex. Centre-ville)"
                        value={loyalty.store_groups?.[s.id] ?? ''}
                        disabled={!canEdit}
                        onChange={(e) => setStoreGroup(s.id, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              )}

              <p className="text-xs text-ink-soft">
                ⚠ Changer le périmètre ne fusionne pas les soldes existants :
                les points déjà acquis restent sur leur carte d&apos;origine.
              </p>
            </>
          )}
        </div>
      )}

      {/* -------- Carte fidélité Apple Wallet -------- */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Carte Apple Wallet</h2>
            <p className="text-xs text-ink-soft mt-0.5">
              Le client ajoute sa carte fidélité à Apple Wallet en un tap.
              Le solde se met à jour tout seul après chaque passage caisse.
            </p>
          </div>
          <input
            type="checkbox" className="h-5 w-5 shrink-0"
            checked={wallet.enabled}
            disabled={!canEdit || !loyalty.enabled}
            onChange={(e) => patchWallet('enabled', e.target.checked)}
          />
        </div>

        {!loyalty.enabled && (
          <p className="text-xs text-warning">
            Activez d&apos;abord le programme fidélité ci-dessus.
          </p>
        )}

        {wallet.enabled && loyalty.enabled && (
          <>
            <div className="rounded-xl bg-accent-soft/60 border border-border p-3 text-xs text-ink-soft space-y-1">
              <p><strong>Prérequis Apple (5 min sur developer.apple.com)</strong></p>
              <ol className="list-decimal list-inside space-y-0.5 ml-1">
                <li>Créer un <em>Pass Type ID</em> (ex. <code className="text-[11px]">pass.fr.webpos.loyalty</code>).</li>
                <li>Générer le <em>Pass Signing Certificate</em> associé (fichier .p12).</li>
                <li>Récupérer votre <em>Team ID</em> (10 caractères, portail Apple).</li>
              </ol>
              <p className="pt-1">
                Le certificat .p12 s&apos;installe ensuite côté serveur via
                les variables <code className="text-[11px]">APPLE_WALLET_CERT_P12_B64</code>{' '}
                et <code className="text-[11px]">APPLE_WALLET_CERT_PASSWORD</code>.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-medium text-ink-soft">Pass Type ID</label>
                <input
                  type="text" className="input mt-1 font-mono text-sm"
                  placeholder="pass.fr.webpos.loyalty"
                  value={wallet.pass_type_id}
                  disabled={!canEdit}
                  onChange={(e) => patchWallet('pass_type_id', e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-ink-soft">Team ID</label>
                <input
                  type="text" className="input mt-1 font-mono text-sm"
                  placeholder="ABCD1234EF" maxLength={12}
                  value={wallet.team_id}
                  disabled={!canEdit}
                  onChange={(e) => patchWallet('team_id', e.target.value.toUpperCase())}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-ink-soft">Texte du logo</label>
                <input
                  type="text" className="input mt-1"
                  placeholder="(nom de la boutique par défaut)"
                  maxLength={60}
                  value={wallet.logo_text}
                  disabled={!canEdit}
                  onChange={(e) => patchWallet('logo_text', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-ink-soft">Libellé du solde</label>
                <input
                  type="text" className="input mt-1"
                  maxLength={40}
                  value={wallet.primary_label}
                  disabled={!canEdit}
                  onChange={(e) => patchWallet('primary_label', e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-ink-soft">Fond</label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="color" className="h-9 w-10 rounded-md border border-border cursor-pointer"
                      value={wallet.background_color}
                      disabled={!canEdit}
                      onChange={(e) => patchWallet('background_color', e.target.value.toUpperCase())}
                    />
                    <input
                      type="text" className="input flex-1 font-mono text-xs uppercase"
                      value={wallet.background_color}
                      disabled={!canEdit}
                      maxLength={7}
                      onChange={(e) => patchWallet('background_color', e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-ink-soft">Texte</label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="color" className="h-9 w-10 rounded-md border border-border cursor-pointer"
                      value={wallet.foreground_color}
                      disabled={!canEdit}
                      onChange={(e) => patchWallet('foreground_color', e.target.value.toUpperCase())}
                    />
                    <input
                      type="text" className="input flex-1 font-mono text-xs uppercase"
                      value={wallet.foreground_color}
                      disabled={!canEdit}
                      maxLength={7}
                      onChange={(e) => patchWallet('foreground_color', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-ink-soft">Champs affichés</label>
              <div className="mt-2 flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={wallet.show_points} disabled={!canEdit}
                         onChange={(e) => patchWallet('show_points', e.target.checked)} />
                  Points
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={wallet.show_tier} disabled={!canEdit}
                         onChange={(e) => patchWallet('show_tier', e.target.checked)} />
                  Statut (Or / Argent…)
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={wallet.show_since} disabled={!canEdit}
                         onChange={(e) => patchWallet('show_since', e.target.checked)} />
                  Membre depuis
                </label>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-ink-soft">
                Message au verso <span className="text-ink-soft/60">(facultatif)</span>
              </label>
              <textarea
                className="input mt-1 h-20 text-sm py-2"
                placeholder="Merci pour votre fidélité. Rendez-vous en boutique très bientôt !"
                maxLength={500}
                value={wallet.back_message}
                disabled={!canEdit}
                onChange={(e) => patchWallet('back_message', e.target.value)}
              />
            </div>

            {/* Preview live du pass */}
            <div className="pt-2">
              <div className="text-xs font-medium text-ink-soft mb-2">Aperçu</div>
              <WalletPreview wallet={wallet} shopName={wallet.logo_text || 'Ma boutique'} />
            </div>
          </>
        )}
      </div>

      {error && <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
      {saved && <div className="rounded-xl bg-success/10 px-3 py-2 text-sm text-success">✓ Paramètres enregistrés</div>}

      {canEdit && (
        <button onClick={() => void submit()} disabled={saving} className="btn-primary">
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      )}
    </div>
  );
}

/** Option radio du périmètre fidélité (carte cliquable). */
function ScopeRadio({ checked, disabled, onSelect, title, desc }: {
  checked: boolean; disabled: boolean; onSelect: () => void;
  title: string; desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`w-full text-left rounded-xl border p-3 flex items-start gap-3 transition ${
        checked ? 'border-accent bg-accent-soft/50' : 'border-border hover:bg-gray-50'
      } disabled:opacity-60`}
    >
      <span className={`mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 grid place-items-center ${
        checked ? 'border-accent-deep' : 'border-ink-soft/40'
      }`}>
        {checked && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--primary)' }} />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-ink-soft mt-0.5">{desc}</span>
      </span>
    </button>
  );
}

/**
 * Aperçu en direct du pass Apple Wallet, calé sur les paramètres
 * saisis dans le formulaire. Rendu purement CSS — imite la carte
 * Wallet réelle sans la générer (le .pkpass est produit côté serveur).
 */
function WalletPreview({ wallet, shopName }: { wallet: WalletPassSettings; shopName: string }) {
  const bg = wallet.background_color || '#556B3E';
  const fg = wallet.foreground_color || '#F5F1E8';
  const labelColor = fg + 'A8'; // ~66% opacity
  return (
    <div
      className="rounded-2xl p-4 max-w-[320px] shadow-lg font-sans"
      style={{ backgroundColor: bg, color: fg }}
    >
      <div className="flex items-center justify-between gap-2 pb-4">
        <div className="flex items-center gap-2">
          <div
            className="h-8 w-8 rounded-lg grid place-items-center font-bold text-sm"
            style={{ backgroundColor: fg, color: bg }}
          >
            {shopName.charAt(0).toUpperCase()}
          </div>
          <div className="text-xs font-semibold uppercase tracking-wider truncate max-w-[140px]">
            {shopName}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[8px] uppercase tracking-widest font-bold" style={{ color: labelColor }}>
            Membre
          </div>
          <div className="text-xs font-medium">Marie D.</div>
        </div>
      </div>

      <div className="pb-5">
        <div className="text-[9px] uppercase tracking-widest font-bold" style={{ color: labelColor }}>
          {wallet.primary_label || 'Solde'}
        </div>
        <div className="text-3xl font-medium leading-none mt-1 tabular-nums">12,50 €</div>
      </div>

      <div className="grid grid-cols-3 gap-3 pb-4">
        {wallet.show_points && (
          <div>
            <div className="text-[8px] uppercase tracking-widest font-bold" style={{ color: labelColor }}>
              Points
            </div>
            <div className="text-xs font-medium mt-0.5">250</div>
          </div>
        )}
        {wallet.show_tier && (
          <div>
            <div className="text-[8px] uppercase tracking-widest font-bold" style={{ color: labelColor }}>
              Statut
            </div>
            <div className="text-xs font-medium mt-0.5">Or</div>
          </div>
        )}
        {wallet.show_since && (
          <div>
            <div className="text-[8px] uppercase tracking-widest font-bold" style={{ color: labelColor }}>
              Depuis
            </div>
            <div className="text-xs font-medium mt-0.5">03 / 24</div>
          </div>
        )}
      </div>

      <div className="rounded-md bg-white p-2 grid place-items-center">
        <div
          className="h-24 w-24 grid place-items-center"
          style={{
            background:
              'repeating-conic-gradient(#111 0% 25%, #fff 0% 50%) 50% / 8px 8px',
          }}
          aria-label="QR fidélité (aperçu)"
        />
        <div className="text-[9px] mt-1 font-mono text-black tracking-wider">FID-XXXX-XXXX</div>
      </div>
    </div>
  );
}
