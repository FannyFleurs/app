// Types partagés du tableau de bord analytique (caisse + back-office).
// Toutes les valeurs monétaires sont fournies en TTC ET en HT afin que le
// basculement TTC/HT côté client soit instantané, sans nouvel appel réseau.

export interface KpiSet {
  ca_ttc: number;
  ca_ht: number;
  tva: number;
  tickets: number;
  customers: number;
  marge: number;        // marge HT (revenu HT - coût HT)
  avg_ttc: number;      // panier moyen TTC
  avg_ht: number;       // panier moyen HT
}

export interface DailySeries {
  labels: string[];         // dates de la période courante, ex. "mar 30"
  ca_ttc: number[];
  ca_ht: number[];
  ticket_ttc: number[];
  ticket_ht: number[];
  marge: number[];
  prev_ca_ttc: number[];
  prev_ca_ht: number[];
  prev_ticket_ttc: number[];
  prev_ticket_ht: number[];
  prev_marge: number[];
}

export interface HourBucket {
  hour: number;
  ca_ttc: number;
  ca_ht: number;
  prev_ca_ttc: number;
  prev_ca_ht: number;
}

export interface WeekdayBucket {
  dow: number;              // 0 = dimanche … 6 = samedi
  label: string;            // "Dimanche" …
  ca_ttc: number;
  ca_ht: number;
  prev_ca_ttc: number;
  prev_ca_ht: number;
}

export interface PaymentSlice {
  method: string;
  label: string;
  amount: number;           // encaissé (TTC)
}

export interface TvaRow {
  rate: number;
  base_ht: number;
  tva: number;
  ttc: number;
}

export interface ProductRow {
  label: string;
  qty: number;
  ca_ttc: number;
  ca_ht: number;
}

export interface DashboardData {
  period: { from: string; to: string };
  prevPeriod: { from: string; to: string };
  periodLabel: string;
  prevLabel: string;
  summary: { current: KpiSet; prev: KpiSet };
  daily: DailySeries;
  hourly: HourBucket[];
  weekday: WeekdayBucket[];
  payments: PaymentSlice[];
  tva: TvaRow[];
  products: ProductRow[];    // triés par CA TTC décroissant
}

export const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Espèces',
  card: 'Carte Bancaire',
  check: 'Chèque',
  transfer: 'Virement',
  gift_card: 'Bon cadeau',
  credit_note: 'Avoir',
  deferred: 'En compte',
  payment_link: 'Lien de paiement',
  other: 'Autre',
};
