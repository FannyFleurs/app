import PromoCodesAdmin from './PromoCodesAdmin';

export const dynamic = 'force-dynamic';

export default function PromoCodesPage() {
  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Codes d&apos;activation</h1>
      <p className="text-sm text-ink-soft mb-5">
        Créez des codes promo (remise ou abonnement offert). Les clients les
        saisissent sur la page de paiement Stripe lors de leur inscription.
      </p>
      <PromoCodesAdmin />
    </div>
  );
}
