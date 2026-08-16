import { pageMeta } from '@/lib/site/meta';
import { tradeBySlug } from '@/lib/site/content/trades';
import SeoTrade from '../_components/SeoTrade';

/**
 * Page de recherche dediee au metier « cavistes ».
 *
 * Le contenu vit dans lib/site/content/trades.ts (bloc `seo`) : il est ecrit
 * pour ce commerce precis, et n'est pas la variante d'une autre page.
 */
const trade = tradeBySlug('cavistes')!;

export const metadata = pageMeta({
  title: trade.seo.title,
  description: trade.seo.description,
  path: '/logiciel-caisse-caviste',
});

export default function Page() {
  return <SeoTrade slug="cavistes" />;
}
