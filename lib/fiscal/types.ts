/**
 * Types des événements fiscaux acceptés par FiscalCore.
 * L'ajout d'un type doit être tracé et la documentation conformité mise à jour.
 */
export const FISCAL_EVENT_TYPES = [
  'SALE_VALIDATED',
  'SALE_CANCELLED_BY_CREDIT_NOTE',
  'CREDIT_NOTE_ISSUED',
  'INVOICE_VALIDATED',
  'INVOICE_CANCELLED',
  'PAYMENT_REGISTERED',
  'CASH_SESSION_OPENED',
  'CASH_SESSION_CLOSED',
  'DAILY_CLOSURE_SEALED',
  'MONTHLY_CLOSURE_SEALED',
  'YEARLY_CLOSURE_SEALED',
  'ARCHIVE_GENERATED',
  'GIFT_CARD_ISSUED',
  'GIFT_CARD_USED',
] as const;
export type FiscalEventType = (typeof FISCAL_EVENT_TYPES)[number];

export type FiscalEntityType =
  | 'sale'
  | 'invoice'
  | 'credit_note'
  | 'payment'
  | 'cash_session'
  | 'closure_daily'
  | 'closure_monthly'
  | 'closure_yearly'
  | 'archive'
  | 'gift_card';

export interface FiscalEventInput {
  organizationId: string;
  storeId?: string | null;
  registerId?: string | null;
  userId?: string | null;
  eventType: FiscalEventType;
  entityType: FiscalEntityType;
  entityId?: string | null;
  payload: Record<string, unknown>;
  /** Contribution au grand total TTC (positive pour ventes, négative pour avoirs). 0 si non applicable. */
  amountTtcDelta?: number;
}

export interface FiscalEventRecord {
  id: string;
  immutableIndex: string;
  eventType: FiscalEventType;
  entityType: FiscalEntityType;
  entityId: string | null;
  previousHash: string;
  currentHash: string;
  payload: Record<string, unknown>;
  createdAt: string;
}
