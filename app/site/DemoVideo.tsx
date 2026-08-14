'use client';

import { useState } from 'react';

const GREEN = '#013E37';
const BORDER = '#E7E3D8';

/** Construit l'URL d'intégration à partir d'un lien YouTube / Vimeo / Loom / .mp4. */
function resolveEmbed(url: string): { type: 'iframe' | 'video'; src: string } | null {
  if (!url) return null;
  if (/\.mp4($|\?)/i.test(url)) return { type: 'video', src: url };
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return { type: 'iframe', src: `https://www.youtube.com/embed/${yt[1]}?autoplay=1&rel=0` };
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return { type: 'iframe', src: `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1` };
  const loom = url.match(/loom\.com\/(?:share|embed)\/([\w-]+)/);
  if (loom) return { type: 'iframe', src: `https://www.loom.com/embed/${loom[1]}?autoplay=1` };
  return { type: 'iframe', src: url };
}

/**
 * Encart vidéo de démonstration : affiche une vignette (capture) avec un bouton
 * de lecture ; au clic, charge le lecteur (iframe ou <video>). Rendu seulement
 * si une URL est fournie côté page.
 */
export default function DemoVideo({ url, poster }: { url: string; poster: string }) {
  const [playing, setPlaying] = useState(false);
  const embed = resolveEmbed(url);
  if (!embed) return null;

  return (
    <div
      className="rounded-2xl overflow-hidden border shadow-2xl"
      style={{ borderColor: BORDER, boxShadow: '0 30px 60px -20px rgba(1,43,38,0.35)' }}
    >
      <div className="relative w-full" style={{ aspectRatio: '16 / 9', backgroundColor: '#012B26' }}>
        {!playing ? (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label="Lire la vidéo de démonstration"
            className="group absolute inset-0 h-full w-full"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={poster} alt="" className="h-full w-full object-cover object-top" />
            <span className="absolute inset-0 grid place-items-center" style={{ background: 'rgba(1,43,38,0.28)' }}>
              <span
                className="grid h-16 w-16 place-items-center rounded-full shadow-lg transition-transform group-hover:scale-105"
                style={{ backgroundColor: '#FFEFB3', color: GREEN }}
              >
                <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
              </span>
            </span>
          </button>
        ) : embed.type === 'video' ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video src={embed.src} controls autoPlay className="h-full w-full" />
        ) : (
          <iframe
            src={embed.src}
            title="Démonstration HelloPos"
            className="h-full w-full"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
          />
        )}
      </div>
    </div>
  );
}
