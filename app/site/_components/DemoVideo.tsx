'use client';

import { useState } from 'react';
import { track } from '@/lib/site/analytics';
import { Icon } from './icons';

/**
 * Démonstration vidéo — affichée uniquement si une URL a été renseignée dans
 * les réglages de la plateforme. Rien n'est chargé avant le clic : la façade
 * est une capture du logiciel, le lecteur n'apparaît qu'à la demande.
 */
export default function DemoVideo({ url, poster }: { url: string; poster: string }) {
  const [playing, setPlaying] = useState(false);
  if (!url) return null;

  const isFile = /\.(mp4|webm|mov)$/i.test(url);
  const embed = (() => {
    const yt = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{6,})/.exec(url);
    if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}?autoplay=1&rel=0`;
    const vimeo = /vimeo\.com\/(\d+)/.exec(url);
    if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1`;
    return url;
  })();

  if (!playing) {
    const base = poster.replace(/\.png$/, '');
    return (
      <button
        type="button"
        className="hp-video-facade"
        onClick={() => {
          setPlaying(true);
          track('voir_demo', { source: 'accueil' });
        }}
      >
        <picture>
          <source type="image/webp" srcSet={`${base}-m.webp 800w, ${base}.webp 1600w`} sizes="(max-width: 900px) 100vw, 900px" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={poster} alt="" width={1440} height={900} loading="lazy" decoding="async" />
        </picture>
        <span className="hp-video-play">
          <Icon name="play" size={20} />
          Voir la démo
        </span>
      </button>
    );
  }

  return (
    <div className="hp-video-frame">
      {isFile ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video src={url} controls autoPlay playsInline poster={poster} />
      ) : (
        <iframe
          src={embed}
          title="Démonstration de HelloPos"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
      )}
    </div>
  );
}
