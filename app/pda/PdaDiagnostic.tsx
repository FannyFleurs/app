'use client';

import { useCallback, useState } from 'react';
import { useScanField, type ScanInfo } from './scan';
import { Screen, Header, ScanField, InfoRow } from './ui';

/**
 * Diagnostic du scan.
 *
 * Les lecteurs intégrés des terminaux Android ne transmettent pas tous un
 * code de la même façon : frappes clavier, événements `input`, ou écriture
 * directe dans le champ sans le moindre événement. Impossible de deviner
 * lequel s'applique — cet écran le montre.
 *
 * On scanne un article ici, et on lit quel canal a réagi. C'est ce qui permet
 * de corriger sur des faits plutôt que sur des suppositions.
 */
export default function PdaDiagnostic({ onBack, onHome }: {
  onBack: () => void;
  onHome: () => void;
}) {
  const [log, setLog] = useState<Array<{
    code: string; at: string; source: string; field: string; dirty: boolean;
  }>>([]);

  const onCode = useCallback((code: string, info?: ScanInfo) => {
    let at = '';
    try { at = new Date().toLocaleTimeString('fr-FR'); } catch { /* ignore */ }
    setLog((cur) => [{
      code, at,
      source: info?.source ?? '—',
      field: info?.field ?? '',
      dirty: info?.dirty ?? false,
    }, ...cur].slice(0, 12));
  }, []);

  // Aucun catalogue ici : on accepte tout code, l'objectif est d'observer.
  const field = useScanField({ onCode, canResolve: () => true });

  return (
    <Screen>
      <Header title="Diagnostic du scan" onBack={onBack} onHome={onHome} />

      <div className="shrink-0 p-3 bg-surface border-b border-border">
        <div className="text-xs text-ink-soft mb-1.5">
          Scannez un article ici. Rien n&apos;est enregistré : on observe seulement.
        </div>
        <ScanField field={field} placeholder="Scanner pour tester…" />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        <div className="card divide-y divide-border">
          <div className="px-4 py-2.5 text-[11px] uppercase tracking-widest text-ink-soft font-semibold">
            État
          </div>
          <InfoRow
            label="Champ armé (focus)"
            value={field.armed ? 'oui' : 'non'}
            tone={field.armed ? 'success' : 'danger'}
          />
          <InfoRow label="Mode" value={field.manual ? 'saisie manuelle' : 'scan'} />
          <InfoRow label="Version installée" value={process.env.NEXT_PUBLIC_BUILD_ID ?? '—'} />
        </div>

        <div className="card divide-y divide-border">
          <div className="px-4 py-2.5 text-[11px] uppercase tracking-widest text-ink-soft font-semibold">
            Canaux détectés
          </div>
          <InfoRow label="Frappes clavier" value={field.stats.keydown} />
          <InfoRow label="Événements « input »" value={field.stats.input} />
          <InfoRow label="Changements de valeur" value={field.stats.valueChanges} />
          <InfoRow label="Codes validés" value={field.stats.emitted}
                   tone={field.stats.emitted > 0 ? 'success' : undefined} />
        </div>

        <div className="card divide-y divide-border">
          <div className="px-4 py-2.5 text-[11px] uppercase tracking-widest text-ink-soft font-semibold">
            Dernières valeurs
          </div>
          <InfoRow label="Dernière touche" value={field.stats.lastKey || '—'} />
          <InfoRow label="Dernier code" value={field.stats.lastCode || '—'} />
          <InfoRow label="Canal du dernier code" value={field.stats.lastSource || '—'} />
          <InfoRow label="Champ lu à la validation" value={field.stats.lastField || '(vide)'} />
          <InfoRow label="Frappes lues à la validation" value={field.stats.lastKeys || '(vide)'} />
          <InfoRow
            label="Champ NON vidé avant un scan"
            value={field.stats.dirtyBefore}
            tone={field.stats.dirtyBefore > 0 ? 'danger' : 'success'}
          />
        </div>

        <div className="card">
          <div className="px-4 py-2.5 text-[11px] uppercase tracking-widest text-ink-soft font-semibold border-b border-border">
            Codes lus ({log.length})
          </div>
          {log.length === 0 ? (
            <p className="px-4 py-4 text-sm text-ink-soft">Aucun scan pour l&apos;instant.</p>
          ) : (
            <ul className="divide-y divide-border">
              {log.map((l, i) => (
                <li key={`${l.at}-${i}`} className="px-4 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-mono text-sm truncate">{l.code}</span>
                    <span className="text-xs text-ink-soft shrink-0">{l.at}</span>
                  </div>
                  <div className="text-xs text-ink-soft truncate">
                    canal : {l.source}
                    {l.dirty && <span className="text-danger font-semibold"> · champ résiduel : {l.field}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="px-1 text-xs text-ink-soft">
          Lecture : scannez DEUX articles différents. Si les deux codes lus sont
          identiques, ou si « Champ NON vidé avant un scan » est supérieur à 0, c&apos;est
          que le terminal renvoie l&apos;ancien contenu — la ligne concernée affiche alors
          le résidu en rouge.
        </p>
      </div>
    </Screen>
  );
}
