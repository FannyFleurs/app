'use client';

import { useState } from 'react';

interface Register {
  id: string;
  store_id: string;
  code: string;
  name: string;
  device_id: string | null;
  device_name: string | null;
}
interface Store { id: string; code: string; name: string; }

interface Props {
  stores: Store[];
  registers: Register[];
  deviceId: string;
  onBound: (storeId: string, registerId: string) => void;
}

/**
 * Ecran de premiere connexion sur un poste (tablette / iPad / PC).
 * L'utilisateur choisit la caisse a laquelle CE poste va etre lie.
 * Une caisse deja liee a un autre appareil est affichee mais grisee,
 * avec le nom de l'appareil en cours et un message "Contactez un admin".
 * Le nom du poste (facultatif) aide l'admin a identifier l'appareil
 * dans la liste "Postes connectes" pour eventuellement le liberer.
 */
export default function RegisterPicker({ stores, registers, deviceId, onBound }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('webpos_device_name') ?? defaultDeviceName();
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function bind(registerId: string) {
    const target = registers.find((r) => r.id === registerId);
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const name = deviceName.trim() || defaultDeviceName();
      const res = await fetch(`/api/registers/${registerId}/bind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId, device_name: name }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409 && j?.error === 'ALREADY_BOUND') {
          setError(
            `Cette caisse est deja utilisee${
              j.device_name ? ` par le poste "${j.device_name}"` : ''
            }. Demandez a un administrateur de la liberer.`,
          );
        } else {
          setError(j?.message || 'Impossible de lier ce poste a la caisse.');
        }
        return;
      }
      localStorage.setItem('webpos_device_name', name);
      onBound(target.store_id, target.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full grid place-items-center p-4">
      <div className="card p-6 md:p-8 max-w-2xl w-full">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl accent-bar text-white text-2xl">
            ◆
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Choisir la caisse de ce poste
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            Un poste = une caisse. Ce choix est memorise sur cet appareil.
            Pour changer de caisse par la suite, un administrateur devra
            liberer la caisse depuis les parametres.
          </p>
        </div>

        <label className="block text-sm font-medium mb-1">
          Nom de ce poste <span className="text-ink-soft">(facultatif)</span>
        </label>
        <input
          className="input w-full mb-6"
          value={deviceName}
          onChange={(e) => setDeviceName(e.target.value)}
          placeholder='Ex. "iPad comptoir", "Tablette Sophie"'
          maxLength={80}
        />

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-3 py-2">
            {error}
          </div>
        )}

        <div className="space-y-4 max-h-[50vh] overflow-y-auto">
          {stores.map((s) => {
            const regs = registers.filter((r) => r.store_id === s.id);
            if (regs.length === 0) return null;
            return (
              <div key={s.id}>
                <div className="text-xs uppercase tracking-wider text-ink-soft font-semibold mb-2">
                  {s.name}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {regs.map((r) => {
                    const taken = r.device_id && r.device_id !== deviceId;
                    const isSelected = selected === r.id;
                    return (
                      <button
                        key={r.id}
                        disabled={!!taken || busy}
                        onClick={() => { setSelected(r.id); void bind(r.id); }}
                        className={`text-left rounded-xl border p-4 transition ${
                          taken
                            ? 'border-border bg-gray-50 opacity-60 cursor-not-allowed'
                            : isSelected
                              ? 'border-accent bg-accent-soft'
                              : 'border-border hover:border-accent hover:bg-accent-soft/40'
                        }`}
                      >
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-xs text-ink-soft">{r.code}</span>
                          <span className="font-medium">{r.name}</span>
                        </div>
                        {taken ? (
                          <div className="mt-1 text-xs text-ink-soft">
                            Utilisee par {r.device_name ?? 'un autre poste'}
                          </div>
                        ) : (
                          <div className="mt-1 text-xs text-ink-soft">
                            {busy && isSelected ? 'Liaison en cours…' : 'Disponible'}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function defaultDeviceName(): string {
  if (typeof window === 'undefined') return 'Poste';
  const ua = navigator.userAgent || '';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/Android/i.test(ua)) return 'Tablette Android';
  if (/Macintosh/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'PC Windows';
  return 'Poste';
}
