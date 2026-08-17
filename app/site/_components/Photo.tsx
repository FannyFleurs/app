import { photo } from '@/lib/site/media';

/**
 * Emplacement photographique.
 *
 * Si une photo a été validée pour cet emplacement (lib/site/media.ts), elle
 * est servie en AVIF/WebP/JPEG avec ses variantes responsives. Sinon, le
 * composant dessine une composition graphique aux couleurs de la marque :
 * la mise en page reste juste, et le site n'affiche jamais une image
 * d'illustration qui ne serait pas la sienne.
 */

export default function Photo({
  slot,
  ratio = 'landscape',
  className = '',
  sizes = '(max-width: 900px) 100vw, 50vw',
  priority = false,
}: {
  slot: string;
  ratio?: 'landscape' | 'portrait' | 'wide' | 'auto';
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const asset = photo(slot);
  const ratioClass =
    ratio === 'portrait'
      ? ' hp-photo--tall'
      : ratio === 'wide'
        ? ' hp-photo--wide'
        : ratio === 'auto'
          ? ' hp-photo--auto'
          : '';
  const cls = `hp-photo${ratioClass} ${className}`.trim();

  if (!asset) {
    return <div className={cls} aria-hidden="true"><span className="hp-photo-fallback" /></div>;
  }

  const fallback = asset.fallback ?? 'jpg';
  const formats = asset.formats ?? ['avif', 'webp', fallback];
  const sources = formats.filter((f) => f !== fallback);
  const srcSet = (ext: string) =>
    asset.mobile ? `${asset.base}-m.${ext} 800w, ${asset.base}.${ext} 1600w` : `${asset.base}.${ext} 1600w`;

  return (
    <figure className={cls}>
      <picture>
        {sources.map((ext) => (
          <source key={ext} type={`image/${ext}`} srcSet={srcSet(ext)} sizes={sizes} />
        ))}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${asset.base}.${fallback}`}
          alt={asset.alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
        />
      </picture>
      {asset.credit ? <figcaption className="hp-caption">{asset.credit}</figcaption> : null}
    </figure>
  );
}
