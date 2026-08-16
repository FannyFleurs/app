import type { Metadata } from 'next';

/**
 * Métadonnées et données structurées du site public.
 *
 * Centralisé pour que chaque page dispose du même socle : titre, description,
 * canonical, OpenGraph, Twitter card. Les données structurées se limitent à
 * ce qui est vérifiable : identité de l'éditeur, description du logiciel,
 * fil d'Ariane, questions fréquentes. Aucune note ni avis agrégé n'est
 * déclaré — il n'en existe pas.
 */
export const SITE_URL = 'https://hellopos.fr';
export const SITE_NAME = 'HelloPos';
const OG_IMAGE = '/site/og.png';

export function pageMeta({
  title,
  description,
  path,
  noIndex = false,
}: {
  title: string;
  description: string;
  path: string;
  noIndex?: boolean;
}): Metadata {
  const url = SITE_URL + (path === '/' ? '' : path);
  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    alternates: { canonical: path === '/' ? '/' : path },
    ...(noIndex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale: 'fr_FR',
      type: 'website',
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: SITE_NAME }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [OG_IMAGE],
    },
  };
}

/** Identité de l'éditeur. Les champs vides ne sont pas déclarés. */
export function organizationLd(opts: {
  brand: string;
  logoUrl?: string;
  email?: string;
  phone?: string;
  legalName?: string;
  address?: { street?: string; zip?: string; city?: string; country?: string };
}) {
  const { brand, logoUrl, email, phone, legalName, address } = opts;
  const hasAddress = address && (address.street || address.city);
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: brand,
    url: SITE_URL,
    logo: logoUrl || `${SITE_URL}${OG_IMAGE}`,
    ...(legalName ? { legalName } : {}),
    ...(email || phone
      ? {
          contactPoint: {
            '@type': 'ContactPoint',
            contactType: 'sales',
            areaServed: 'FR',
            availableLanguage: 'French',
            ...(email ? { email } : {}),
            ...(phone ? { telephone: phone } : {}),
          },
        }
      : {}),
    ...(hasAddress
      ? {
          address: {
            '@type': 'PostalAddress',
            ...(address?.street ? { streetAddress: address.street } : {}),
            ...(address?.zip ? { postalCode: address.zip } : {}),
            ...(address?.city ? { addressLocality: address.city } : {}),
            addressCountry: address?.country || 'FR',
          },
        }
      : {}),
  };
}

/**
 * Description du logiciel. Le prix d'entrée est déclaré parce qu'il est
 * public et exact ; aucune note ni nombre d'avis n'est ajouté.
 */
export function softwareLd(opts: { brand: string; priceFrom: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: opts.brand,
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Point of Sale',
    operatingSystem: 'Web',
    url: SITE_URL,
    inLanguage: 'fr-FR',
    description:
      'Logiciel de caisse et de gestion pour commerçants indépendants : encaissement, stocks, commandes, clients, fidélité, facturation et pilotage.',
    offers: {
      '@type': 'Offer',
      price: opts.priceFrom,
      priceCurrency: 'EUR',
      category: 'subscription',
      url: `${SITE_URL}/tarifs`,
    },
  };
}
