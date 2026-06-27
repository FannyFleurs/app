'use client';

import { useEffect, useState } from 'react';

interface PermissionRow {
  permission: string;
  default: boolean;
  override: boolean | null; // null = pas d'override, true = accordé, false = refusé
}
interface RoleMatrix {
  role: string;
  permissions: PermissionRow[];
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Admin',
  manager: 'Responsable',
  vendeur: 'Vendeur',
  comptable: 'Comptable',
  lecture_seule: 'Lecture seule',
  support_technique: 'Support',
};

// Regroupe les permissions par "domaine" (préfixe avant le premier point).
const PERMISSION_GROUPS: Record<string, string> = {
  pos: 'Caisse',
  products: 'Produits',
  categories: 'Catégories',
  stock: 'Stock',
  customers: 'Clients',
  invoices: 'Factures',
  closures: 'Clôtures',
  fiscal: 'Conformité fiscale',
  users: 'Utilisateurs',
  settings: 'Paramètres',
};

const PERMISSION_LABELS: Record<string, string> = {
  'pos.use': 'Accéder à la caisse',
  'pos.override_price': 'Forcer un prix libre',
  'pos.discount_line': 'Remise sur ligne',
  'pos.discount_cart': 'Remise sur ticket',
  'pos.refund': 'Remboursement / retour',
  'pos.void_validated_sale': 'Annuler une vente validée',
  'pos.settings.write': 'Modifier paramètres caisse',
  'products.read': 'Voir le catalogue',
  'products.write': 'Créer / modifier produits',
  'categories.write': 'Gérer les catégories',
  'stock.adjust': 'Ajuster le stock',
  'customers.read': 'Voir les clients',
  'customers.write': 'Créer / modifier clients',
  'customers.anonymize': 'Anonymiser un client',
  'invoices.create': 'Créer une facture',
  'invoices.validate': 'Valider une facture',
  'closures.daily': 'Clôture journalière',
  'closures.monthly': 'Clôture mensuelle',
  'closures.yearly': 'Clôture annuelle',
  'fiscal.audit': 'Audit fiscal',
  'fiscal.archive': 'Archives fiscales',
  'fiscal.export': 'Exports comptables',
  'users.read': 'Voir les utilisateurs',
  'users.write': 'Gérer les utilisateurs',
  'settings.read': 'Voir les paramètres',
  'settings.write': 'Modifier les paramètres',
};

export default function RolePermissionsAdmin() {
  const [matrix, setMatrix] = useState<RoleMatrix[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>('vendeur');

  async function reload() {
    setLoading(true);
    const r = await fetch('/api/settings/permissions', { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      setMatrix(j.matrix ?? []);
    } else {
      const j = await r.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Erreur de chargement');
    }
    setLoading(false);
  }
  useEffect(() => { void reload(); }, []);

  async function setOverride(role: string, permission: string, granted: boolean | null) {
    const key = `${role}:${permission}`;
    setBusy(key);
    const r = await fetch('/api/settings/permissions', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, permission, granted }),
    });
    setBusy(null);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Erreur');
      return;
    }
    // Patch local pour réactivité immédiate
    setMatrix((cur) => cur.map((rm) =>
      rm.role !== role ? rm : {
        ...rm,
        permissions: rm.permissions.map((p) =>
          p.permission !== permission ? p : { ...p, override: granted },
        ),
      },
    ));
  }

  if (loading) return <div className="text-sm text-ink-soft">Chargement…</div>;

  const currentRole = matrix.find((r) => r.role === selectedRole);

  // Regroupement par domaine
  const grouped = new Map<string, PermissionRow[]>();
  if (currentRole) {
    for (const p of currentRole.permissions) {
      const dom = p.permission.split('.')[0]!;
      const arr = grouped.get(dom) ?? [];
      arr.push(p);
      grouped.set(dom, arr);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      )}

      {/* Sélecteur de rôle */}
      <div className="card p-3 overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {matrix.map((rm) => (
            <button
              key={rm.role}
              onClick={() => setSelectedRole(rm.role)}
              className={`rounded-xl px-4 py-2 text-sm font-medium whitespace-nowrap ${
                selectedRole === rm.role
                  ? 'accent-bar text-white'
                  : 'bg-white border border-border text-ink hover:bg-gray-50'
              }`}
            >
              {ROLE_LABELS[rm.role] ?? rm.role}
            </button>
          ))}
        </div>
      </div>

      {/* Matrice par domaine */}
      {Array.from(grouped.entries()).map(([dom, perms]) => (
        <section key={dom} className="card overflow-hidden">
          <div className="px-4 py-2 border-b border-border bg-gray-50">
            <div className="text-xs uppercase tracking-widest text-ink-soft font-semibold">
              {PERMISSION_GROUPS[dom] ?? dom}
            </div>
          </div>
          <ul className="divide-y divide-border">
            {perms.map((p) => {
              const effective = p.override === null ? p.default : p.override;
              const isOverride = p.override !== null;
              const key = `${selectedRole}:${p.permission}`;
              return (
                <li key={p.permission} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">
                      {PERMISSION_LABELS[p.permission] ?? p.permission}
                    </div>
                    <div className="text-xs text-ink-soft mt-0.5 flex items-center gap-2 flex-wrap">
                      <code className="text-[10px] bg-gray-50 px-1.5 py-0.5 rounded">{p.permission}</code>
                      <span>défaut : {p.default ? '✓ autorisé' : '✗ refusé'}</span>
                      {isOverride && (
                        <span className="text-accent-deep">· override</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Toggle
                      checked={effective}
                      disabled={busy === key}
                      onChange={(v) => {
                        // Si la nouvelle valeur = défaut → on supprime l'override (null).
                        // Sinon → on enregistre un override explicite.
                        const next = v === p.default ? null : v;
                        void setOverride(selectedRole, p.permission, next);
                      }}
                    />
                    {isOverride && (
                      <button
                        onClick={() => void setOverride(selectedRole, p.permission, null)}
                        className="text-xs text-ink-soft hover:text-ink"
                        title="Revenir au défaut"
                      >
                        ↺
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
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
