import type { Metadata } from 'next';

/**
 * Métadonnées partagées des pages du site vitrine : titre, description,
 * canonical, OpenGraph et Twitter card. Centralisé pour rester cohérent et
 * garantir un aperçu de partage correct sur chaque page.
 */
export const SITE_URL = 'https://hellopos.fr';
const OG_IMAGE = '/site/og.png';

export function pageMeta({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const url = SITE_URL + path;
  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    alternates: { canonical: path === '/' ? '/' : path },
    openGraph: {
      title,
      description,
      url,
      siteName: 'HelloPos',
      locale: 'fr_FR',
      type: 'website',
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: 'HelloPos' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [OG_IMAGE],
    },
  };
}
