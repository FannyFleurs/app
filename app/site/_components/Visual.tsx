import { photo } from '@/lib/site/media';
import Photo from './Photo';
import Screen from './Screen';

/**
 * Visuel d'une section : la photographie si elle existe, le logiciel sinon.
 *
 * La direction artistique repose sur des photographies de commerces réels.
 * Tant qu'une photo n'a pas été produite pour un emplacement, on n'affiche ni
 * image d'illustration générique, ni cadre vide : on montre le produit, qui
 * est la matière la plus vraie dont nous disposons.
 *
 * Le jour où la photo est déclarée dans lib/site/media.ts, elle prend la
 * place sans qu'aucune page ne change.
 */
export default function Visual({
  slot,
  screen,
  ratio = 'landscape',
  sizes = '(max-width: 900px) 100vw, 50vw',
  priority = false,
  className = '',
}: {
  slot: string;
  screen: { src: string; alt: string; crop?: 'top' | 'right' | 'left'; caption?: string };
  ratio?: 'landscape' | 'portrait' | 'wide';
  sizes?: string;
  priority?: boolean;
  className?: string;
}) {
  if (photo(slot)) {
    return <Photo slot={slot} ratio={ratio} sizes={sizes} priority={priority} className={className} />;
  }
  return (
    <Screen
      src={screen.src}
      alt={screen.alt}
      frame="window"
      crop={screen.crop}
      caption={screen.caption}
      sizes={sizes}
      priority={priority}
      className={className}
    />
  );
}
