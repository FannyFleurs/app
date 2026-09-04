'use client';

import { barcodeSvg } from '@/lib/services/barcode';
import { computeLabelLayout, barcodeSvgSize, type LabelBlock } from '@/lib/services/label-layout';
import { type LabelProduct } from '@/lib/services/label-print-core';
import {
  type LabelSettings, type LabelLayout, type LabelElementKey,
  LABEL_LAYOUT_DEFAULT,
} from '@/lib/settings/label';

/**
 * Aperçu du rendu d'étiquette + réglage de l'emphase de chaque élément.
 *
 * L'aperçu n'imite plus l'impression : il affiche le résultat du MÊME moteur
 * de mise en page, à l'échelle. Ce qui est montré ici est ce qui sortira de
 * l'imprimante.
 *
 * Le placement libre a disparu, et c'est le fond du correctif : positionner
 * chaque élément à un point de l'étiquette empêche par construction de lui
 * donner une largeur, donc d'y faire tenir un nom sur deux lignes, et ne
 * survit pas à un changement de format. La composition est désormais fixe —
 * nom en haut, prix au centre, code-barres en bas — et seule la force
 * relative de chaque élément reste réglable.
 */

const SAMPLE: LabelProduct = {
  // Nom volontairement long : c'est le cas qui posait problème.
  name: 'Cache-pot céramique émaillée blanc',
  sku: '231/13',
  barcode: '4002477692883',
  sale_price_ttc: 6.9,
};

const ELEMENTS: { key: LabelElementKey; label: string; hint: string; shown: (s: LabelSettings) => boolean }[] = [
  { key: 'name', label: 'Nom', hint: 'En haut, sur 3 lignes au plus', shown: (s) => s.show_name },
  { key: 'sku', label: 'Référence', hint: 'Sous le nom', shown: (s) => s.show_sku },
  { key: 'price', label: 'Prix', hint: 'Au centre', shown: (s) => s.show_price },
  { key: 'barcode', label: 'Code-barres', hint: 'En bas', shown: (s) => s.show_barcode },
];

/** Aperçu fidèle : une boîte au ratio du format, remplie par le moteur. */
export function LabelPreview({ settings, product = SAMPLE, widthPx = 340 }: {
  settings: LabelSettings;
  product?: LabelProduct;
  widthPx?: number;
}) {
  const layout = computeLabelLayout(product, settings);
  // Un seul facteur d'échelle : px par millimètre. Tout en découle.
  const k = widthPx / layout.widthMm;
  const mm = (v: number) => `${v * k}px`;

  return (
    <div
      className="relative bg-white border border-border rounded-md shadow-inner shrink-0 overflow-hidden"
      style={{ width: widthPx, height: layout.heightMm * k }}
    >
      {layout.blocks.map((b, i) => {
        const base: React.CSSProperties = {
          position: 'absolute',
          left: mm(b.xMm), top: mm(b.yMm), width: mm(b.wMm),
          textAlign: 'center', color: '#000',
          // La police RÉELLEMENT imprimée (cf. @font-face LabelPrint dans
          // globals.css), pas celle de l'interface : cette dernière est ~17 %
          // plus large, elle recoupait les lignes déjà découpées par le moteur
          // et ne donnait pas la même allure que l'étiquette sortie.
          fontFamily: 'LabelPrint, Arial, Helvetica, sans-serif',
        };
        if (b.kind === 'barcode') {
          const bcSvg = product.barcode ? barcodeSvg(product.barcode, barcodeSvgSize(b as LabelBlock)) : null;
          return (
            <div
              key={i}
              style={{ ...base, height: mm(b.hMm + b.fontMm * 1.25), display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {bcSvg ? (
                <span
                  style={{ width: '100%', height: '100%', display: 'block' }}
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{
                    __html: bcSvg.replace('<svg', '<svg preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;display:block"'),
                  }}
                />
              ) : (
                <span style={{ fontSize: mm(b.fontMm * 1.6), fontFamily: 'monospace', color: '#999' }}>
                  — pas de code-barres —
                </span>
              )}
            </div>
          );
        }
        return (
          <div
            key={i}
            style={{
              ...base,
              fontSize: mm(b.fontMm),
              lineHeight: mm(b.fontMm * 1.12),
              fontWeight: b.bold ? 700 : 400,
              textDecoration: b.strike ? 'line-through' : undefined,
            }}
          >
            {/* Le découpage des lignes appartient au moteur : on interdit au
                navigateur d'en refaire un autre. */}
            {b.lines.map((l, j) => <div key={j} style={{ whiteSpace: 'nowrap' }}>{l}</div>)}
          </div>
        );
      })}
    </div>
  );
}

export default function LabelEditor({ settings, onChange, canEdit }: {
  settings: LabelSettings;
  onChange: (layout: LabelLayout) => void;
  canEdit: boolean;
}) {
  const layout = settings.layout;

  function setSize(key: LabelElementKey, size: number) {
    onChange({ ...layout, [key]: { ...layout[key], size } });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-5 flex-wrap">
        <div className="shrink-0">
          <LabelPreview settings={settings} />
          <div className="mt-1.5 text-[11px] text-ink-soft text-center tabular-nums">
            {settings.width_mm} × {settings.height_mm} mm · aperçu à l&apos;échelle
          </div>
        </div>

        <div className="flex-1 min-w-[240px] space-y-3">
          <p className="text-sm text-ink-soft">
            La composition est fixe — nom en haut, prix au centre, code-barres en bas —
            et s&apos;adapte au format : le même dessin, à la taille de l&apos;étiquette.
            Ajuste ci-dessous la force de chaque élément.
          </p>
          {ELEMENTS.filter((e) => e.shown(settings)).map((e) => {
            const el = layout[e.key];
            return (
              <div key={e.key} className="rounded-xl border border-border px-3 py-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium">{e.label}</span>
                    <span className="ml-2 text-[11px] text-ink-soft">{e.hint}</span>
                  </div>
                  <span className="text-xs text-ink-soft tabular-nums">×{el.size.toFixed(1)}</span>
                </div>
                {canEdit && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-ink-soft">Taille</span>
                    <input
                      type="range" min={0.5} max={1.8} step={0.1} value={el.size}
                      onChange={(ev) => setSize(e.key, Number(ev.target.value))}
                      className="flex-1"
                      aria-label={`Taille — ${e.label}`}
                    />
                  </div>
                )}
              </div>
            );
          })}
          {canEdit && (
            <button
              className="btn-ghost text-sm text-ink-soft"
              onClick={() => onChange({ ...LABEL_LAYOUT_DEFAULT })}
            >
              ↺ Réinitialiser
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
