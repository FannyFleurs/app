/**
 * Captures du logiciel.
 *
 * Les captures sont les écrans réels de HelloPos (/public/site/screens). Trois
 * variantes existent pour chacune : PNG d'origine (repli), WebP 1600 px et
 * WebP 800 px pour les petits écrans. Les dimensions sont toujours déclarées
 * pour qu'aucune image ne fasse sauter la mise en page.
 *
 * Aucune interface n'est redessinée : on encadre, on recadre, on superpose,
 * jamais on n'invente.
 */

export interface ScreenProps {
  /** Chemin du PNG d'origine, ex. `/site/screens/caisse.png`. */
  src: string;
  alt: string;
  /** Habillage : tablette (comptoir), fenêtre (back-office) ou brut. */
  frame?: 'tablet' | 'window' | 'bare';
  /** Recadrage sur une partie de l'écran. */
  crop?: 'right' | 'left' | 'top';
  /** Chargement prioritaire : uniquement la capture visible au premier écran. */
  priority?: boolean;
  sizes?: string;
  caption?: string;
  className?: string;
}

const NATIVE_W = 1440;
const NATIVE_H = 900;

export default function Screen({
  src,
  alt,
  frame = 'tablet',
  crop,
  priority = false,
  sizes = '(max-width: 1000px) 100vw, 60vw',
  caption,
  className = '',
}: ScreenProps) {
  const base = src.replace(/\.png$/, '');
  const picture = (
    <picture>
      <source type="image/webp" srcSet={`${base}-m.webp 800w, ${base}.webp 1600w`} sizes={sizes} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={NATIVE_W}
        height={NATIVE_H}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
        fetchPriority={priority ? 'high' : 'auto'}
      />
    </picture>
  );
  // Recadrage : on montre la partie utile de l'écran (le haut d'une liste, la
  // colonne de droite d'une caisse) sans jamais retoucher son contenu.
  const img = crop ? <span className={`hp-shot-crop hp-shot-crop--${crop}`}>{picture}</span> : picture;

  if (frame === 'window') {
    return (
      <figure className={className}>
        <div className="hp-window">
          <div className="hp-window-bar" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          {img}
        </div>
        {caption ? <figcaption className="hp-caption">{caption}</figcaption> : null}
      </figure>
    );
  }

  if (frame === 'bare') {
    return (
      <figure className={className}>
        {img}
        {caption ? <figcaption className="hp-caption">{caption}</figcaption> : null}
      </figure>
    );
  }

  return (
    <figure className={className}>
      <div className="hp-device">{img}</div>
      {caption ? <figcaption className="hp-caption">{caption}</figcaption> : null}
    </figure>
  );
}
