'use client';

import { useRef, useState } from 'react';
import { formatEUR } from '@/lib/services/money';
import { ean13Svg } from '@/lib/services/barcode';
import {
  type LabelSettings, type LabelLayout, type LabelElementKey,
  LABEL_LAYOUT_DEFAULT,
} from '@/lib/settings/label';

const SAMPLE = { name: 'Bouquet de roses', sku: 'ROSE-01', barcode: '3401234567890', price: 24.9 };

const ELEMENTS: { key: LabelElementKey; label: string; basePt: number; shown: (s: LabelSettings) => boolean }[] = [
  { key: 'name', label: 'Nom', basePt: 30, shown: (s) => s.show_name },
  { key: 'price', label: 'Prix', basePt: 54, shown: (s) => s.show_price },
  { key: 'barcode', label: 'Code-barres', basePt: 0, shown: (s) => s.show_barcode },
  { key: 'sku', label: 'Référence', basePt: 13, shown: (s) => s.show_sku },
];

function clamp01(v: number) { return Math.min(1, Math.max(0, v)); }

export default function LabelEditor({ settings, onChange, canEdit }: {
  settings: LabelSettings;
  onChange: (layout: LabelLayout) => void;
  canEdit: boolean;
}) {
  const layout = settings.layout;
  const boxRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<LabelElementKey | null>(null);

  // Zone d'aperçu : respecte le ratio de l'étiquette, largeur max ~340 px.
  const ratio = (settings.width_mm || 51) / (settings.height_mm || 51);
  const boxW = 340;
  const boxH = Math.round(boxW / ratio);
  const pxPerLabelPx = boxW / ((settings.width_mm || 51) * 8); // px éditeur / px impression

  function startDrag(e: React.PointerEvent, key: LabelElementKey) {
    if (!canEdit) return;
    e.preventDefault();
    setSelected(key);
    const rect = boxRef.current!.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const x = clamp01((ev.clientX - rect.left) / rect.width);
      const y = clamp01((ev.clientY - rect.top) / rect.height);
      onChange({ ...layout, [key]: { ...layout[key], x, y } });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function setSize(key: LabelElementKey, size: number) {
    onChange({ ...layout, [key]: { ...layout[key], size } });
  }

  const disc = settings.show_discount ? Math.round(SAMPLE.price * 0.9 * 100) / 100 : null;
  const bcSvg = ean13Svg(SAMPLE.barcode, { module: 2, height: 40 });

  function renderContent(key: LabelElementKey) {
    const el = layout[key];
    const fpx = (pt: number) => Math.round(pt * el.size * pxPerLabelPx * 1.33);
    switch (key) {
      case 'name':
        return <span style={{ fontSize: fpx(30), fontWeight: 700, whiteSpace: 'nowrap' }}>{SAMPLE.name}</span>;
      case 'sku':
        return <span style={{ fontSize: fpx(13), whiteSpace: 'nowrap' }}>{SAMPLE.sku}</span>;
      case 'price':
        return (
          <div style={{ textAlign: 'center', whiteSpace: 'nowrap', lineHeight: 1 }}>
            {disc != null && <div style={{ fontSize: fpx(15) }}>au lieu de {formatEUR(SAMPLE.price)}</div>}
            <div style={{ fontSize: fpx(disc != null ? 54 : 56), fontWeight: 700 }}>{formatEUR(disc ?? SAMPLE.price)}</div>
          </div>
        );
      case 'barcode':
        return (
          <div
            style={{ width: Math.round(180 * el.size * pxPerLabelPx * 4) }}
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: (bcSvg ?? '').replace('<svg', '<svg style="width:100%;height:auto;display:block"') }}
          />
        );
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-5 flex-wrap">
        {/* Zone étiquette */}
        <div
          ref={boxRef}
          className="relative bg-white border border-border rounded-lg shadow-inner shrink-0 select-none touch-none overflow-hidden"
          style={{ width: boxW, height: boxH }}
          onPointerDown={() => setSelected(null)}
        >
          {ELEMENTS.filter((e) => e.shown(settings)).map((e) => {
            const el = layout[e.key];
            const isSel = selected === e.key;
            return (
              <div
                key={e.key}
                onPointerDown={(ev) => { ev.stopPropagation(); startDrag(ev, e.key); }}
                className={`absolute cursor-move flex items-center justify-center ${isSel ? 'outline outline-2 outline-primary' : 'hover:outline hover:outline-1 hover:outline-border'}`}
                style={{
                  left: `${el.x * 100}%`, top: `${el.y * 100}%`,
                  transform: 'translate(-50%, -50%)', padding: 2,
                }}
                title={e.label}
              >
                {renderContent(e.key)}
              </div>
            );
          })}
        </div>

        {/* Panneau de réglage de l'élément sélectionné */}
        <div className="flex-1 min-w-[220px] space-y-3">
          <p className="text-sm text-ink-soft">
            Glisse chaque élément pour le placer. Sélectionne-le pour ajuster sa taille.
          </p>
          {ELEMENTS.filter((e) => e.shown(settings)).map((e) => {
            const el = layout[e.key];
            const isSel = selected === e.key;
            return (
              <button
                key={e.key}
                onClick={() => setSelected(e.key)}
                className={`w-full text-left rounded-xl border px-3 py-2 ${isSel ? 'border-primary bg-primary-soft/40' : 'border-border'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{e.label}</span>
                  <span className="text-xs text-ink-soft">×{el.size.toFixed(1)}</span>
                </div>
                {isSel && canEdit && (
                  <div className="mt-2 flex items-center gap-2" onClick={(ev) => ev.stopPropagation()}>
                    <span className="text-xs text-ink-soft">Taille</span>
                    <input
                      type="range" min={0.4} max={2.5} step={0.1} value={el.size}
                      onChange={(ev) => setSize(e.key, Number(ev.target.value))}
                      className="flex-1"
                    />
                  </div>
                )}
              </button>
            );
          })}
          {canEdit && (
            <button
              className="btn-ghost text-sm text-ink-soft"
              onClick={() => onChange({ ...LABEL_LAYOUT_DEFAULT })}
            >
              ↺ Réinitialiser la disposition
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
