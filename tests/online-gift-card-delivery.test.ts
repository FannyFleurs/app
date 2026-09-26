import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractPdfText, extractPdfTextCompact } from './helpers/extract-pdf-text';

/**
 * Distribution par email de la carte cadeau (étape 5, PDF joint depuis la
 * refonte) — lib/services/online-gift-card-delivery.ts, testé directement
 * (le chemin webhook -> fulfillment -> delivery est couvert par
 * tests/online-gift-card-fulfillment.test.ts, section « Distribution »).
 *
 * `query` (lib/db/client) et `sendOrgEmail` (lib/email/send) sont mockés :
 * base de commandes/cartes/organisations en mémoire, capture des emails
 * "envoyés" (dont leurs pièces jointes RÉELLEMENT générées par
 * lib/services/gift-card-certificate-pdf.ts, non mocké) pour vérifier
 * destinataire/contenu (montant, nom du bénéficiaire, message dans le
 * HTML ; code réel dans le PDF joint) sans dépendre d'un vrai fournisseur
 * email.
 */

interface FakeOrderRow {
  id: string; organization_id: string; public_reference: string;
  amount_cents: number;
  buyer_name: string; buyer_email: string;
  recipient_name: string; recipient_email: string | null;
  message: string | null;
  status: string;
  gift_card_id: string | null;
  delivery_mode: 'buyer' | 'recipient';
  delivery_status: string;
  delivery_attempted_at: string | null;
  delivery_sent_at: string | null;
  delivery_error: string | null;
}

interface FakeEmail {
  organizationId: string; storeId: string | null; to: string; toName?: string;
  subject: string; html: string; attachments?: Array<{ name: string; content: Buffer }>;
}

const organizations = [{ id: 'org-a-uuid', name: 'Plante Verte' }, { id: 'org-b-uuid', name: 'Fanny Fleurs' }];
const giftCards = [{
  id: 'gift-card-1', organization_id: 'org-a-uuid', code: '2900000000015',
  issued_at: '2026-01-10T00:00:00.000Z', expires_at: '2027-01-10T00:00:00.000Z',
}];

let orders: FakeOrderRow[] = [];
let sentEmails: FakeEmail[] = [];
let sendShouldFail = false;

function resetFakeDb() {
  orders = [{
    id: 'order-1', organization_id: 'org-a-uuid', public_reference: 'GC-AAAAAAAA',
    amount_cents: 5000,
    buyer_name: 'Jonathan Frissong', buyer_email: 'jonathan@example.com',
    recipient_name: 'Guillaume Dupont', recipient_email: 'guillaume@example.com',
    message: 'Joyeux Noël !',
    status: 'issued',
    gift_card_id: 'gift-card-1',
    delivery_mode: 'buyer',
    delivery_status: 'pending',
    delivery_attempted_at: null,
    delivery_sent_at: null,
    delivery_error: null,
  }];
  sentEmails = [];
  sendShouldFail = false;
}

function order(): FakeOrderRow {
  return orders[0]!;
}

const queryMock = vi.fn(async (text: string, params: unknown[] = []) => {
  if (text.includes("SET delivery_status = 'sending'")) {
    const [orderId] = params as [string];
    const row = orders.find((o) => o.id === orderId && o.status === 'issued' && ['pending', 'failed'].includes(o.delivery_status));
    if (!row) return { rows: [], rowCount: 0 };
    row.delivery_status = 'sending';
    row.delivery_attempted_at = new Date().toISOString();
    return { rows: [{ ...row }], rowCount: 1 };
  }
  if (text.includes('FROM gift_cards g') && text.includes('JOIN organizations o')) {
    const giftCardId = params[0] as string;
    const gc = giftCards.find((g) => g.id === giftCardId);
    const org = gc ? organizations.find((o) => o.id === gc.organization_id) : undefined;
    if (!gc || !org) return { rows: [], rowCount: 0 };
    return { rows: [{ code: gc.code, organization_name: org.name, issued_at: gc.issued_at, expires_at: gc.expires_at }], rowCount: 1 };
  }
  if (text.includes("SET delivery_status = 'sent'")) {
    const [orderId] = params as [string];
    const row = orders.find((o) => o.id === orderId);
    if (row) { row.delivery_status = 'sent'; row.delivery_sent_at = new Date().toISOString(); row.delivery_error = null; }
    return { rows: [], rowCount: row ? 1 : 0 };
  }
  if (text.includes("SET delivery_status = 'failed'")) {
    const [orderId, error] = params as [string, string];
    const row = orders.find((o) => o.id === orderId);
    if (row) { row.delivery_status = 'failed'; row.delivery_error = error; }
    return { rows: [], rowCount: row ? 1 : 0 };
  }
  throw new Error(`Requête non simulée : ${text}`);
});

vi.mock('@/lib/db/client', () => ({ query: queryMock }));

const sendOrgEmailMock = vi.fn(async (args: FakeEmail) => {
  if (sendShouldFail) return { ok: false, error: 'PROVIDER_ERROR', detail: 'connexion refusée par Brevo (détail technique, jamais persisté)' };
  sentEmails.push(args);
  return { ok: true };
});
vi.mock('@/lib/email/send', () => ({ sendOrgEmail: sendOrgEmailMock }));

// PDF réel par défaut (module non mocké dans les autres tests) ; bascule
// possible vers un échec pour tester la résilience (voir « échec de
// génération PDF » ci-dessous) sans jamais mocker la génération elle-même
// ailleurs dans ce fichier.
let pdfShouldFail = false;
const actualPdf = await vi.importActual<typeof import('@/lib/services/gift-card-certificate-pdf')>('@/lib/services/gift-card-certificate-pdf');
vi.mock('@/lib/services/gift-card-certificate-pdf', () => ({
  renderGiftCardCertificatePdf: vi.fn(async (...args: unknown[]) => {
    if (pdfShouldFail) throw new Error('PDF_RENDER_FAILURE');
    return actualPdf.renderGiftCardCertificatePdf(...(args as Parameters<typeof actualPdf.renderGiftCardCertificatePdf>));
  }),
}));

const { deliverOnlineGiftCardOrder } = await import('@/lib/services/online-gift-card-delivery');

beforeEach(() => {
  resetFakeDb();
  pdfShouldFail = false;
  queryMock.mockClear();
  sendOrgEmailMock.mockClear();
});

describe('delivery_mode = buyer', () => {
  it('un seul email, envoyé à buyer.email, avec le montant et le nom du bénéficiaire dans le HTML, le PDF joint contenant le code réel', async () => {
    await deliverOnlineGiftCardOrder('order-1');
    expect(sentEmails).toHaveLength(1);
    const mail = sentEmails[0]!;
    expect(mail.to).toBe('jonathan@example.com');
    expect(mail.html).toContain('50,00'); // formatEUR(50)
    expect(mail.html).toContain('Guillaume Dupont');
    expect(mail.html).not.toContain('2900000000015'); // le code n'est plus dans le HTML — voir le PDF joint
    expect(mail.attachments).toHaveLength(1);
    const pdfText = extractPdfText(mail.attachments![0]!.content);
    expect(extractPdfTextCompact(mail.attachments![0]!.content)).toContain('2900000000015');
    expect(pdfText).toContain('50,00');
    expect(pdfText).toContain('Guillaume Dupont');
    expect(pdfText).toContain('Joyeux Noël');
  });

  it('la pièce jointe est un PDF nommé de façon lisible et sanitizée', async () => {
    await deliverOnlineGiftCardOrder('order-1');
    const attachment = sentEmails[0]!.attachments![0]!;
    expect(attachment.name).toBe('carte-cadeau-plante-verte-2900000000015.pdf');
    expect(Buffer.isBuffer(attachment.content)).toBe(true);
    expect(attachment.content.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('le bénéficiaire ne reçoit AUCUN email, même si recipient.email est renseigné', async () => {
    await deliverOnlineGiftCardOrder('order-1');
    expect(sentEmails.some((m) => m.to === 'guillaume@example.com')).toBe(false);
  });

  it('recipient.email absent (carte imprimable) : le comportement est inchangé, un seul email au buyer', async () => {
    order().recipient_email = null;
    await deliverOnlineGiftCardOrder('order-1');
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]!.to).toBe('jonathan@example.com');
  });

  it('marque delivery_status=sent, delivery_sent_at renseigné, delivery_error nul', async () => {
    await deliverOnlineGiftCardOrder('order-1');
    expect(order().delivery_status).toBe('sent');
    expect(order().delivery_sent_at).not.toBeNull();
    expect(order().delivery_error).toBeNull();
  });
});

describe('delivery_mode = recipient', () => {
  beforeEach(() => { order().delivery_mode = 'recipient'; });

  it('deux emails distincts : confirmation au buyer (sans pièce jointe), carte au recipient (PDF joint avec le code)', async () => {
    await deliverOnlineGiftCardOrder('order-1');
    expect(sentEmails).toHaveLength(2);
    const toBuyer = sentEmails.find((m) => m.to === 'jonathan@example.com')!;
    const toRecipient = sentEmails.find((m) => m.to === 'guillaume@example.com')!;
    expect(toBuyer).toBeTruthy();
    expect(toRecipient).toBeTruthy();
    expect(toBuyer.attachments).toBeUndefined(); // aucune pièce jointe, aucun code dans la confirmation
    expect(toBuyer.html).not.toContain('2900000000015');
    expect(toRecipient.attachments).toHaveLength(1);
    expect(extractPdfTextCompact(toRecipient.attachments![0]!.content)).toContain('2900000000015');
  });

  it("l'email recipient contient le montant et le message dans le HTML, le code réel dans le PDF joint", async () => {
    await deliverOnlineGiftCardOrder('order-1');
    const toRecipient = sentEmails.find((m) => m.to === 'guillaume@example.com')!;
    expect(toRecipient.html).toContain('50,00');
    expect(toRecipient.html).not.toContain('2900000000015');
    const pdfText = extractPdfText(toRecipient.attachments![0]!.content);
    expect(pdfText).toContain('50,00');
    expect(extractPdfTextCompact(toRecipient.attachments![0]!.content)).toContain('2900000000015');
    expect(pdfText).toContain('Joyeux Noël');
  });
});

describe('emails identiques (buyer.email === recipient.email, après normalisation)', () => {
  it("un seul email combiné (confirmation + PDF joint) en mode 'recipient'", async () => {
    order().delivery_mode = 'recipient';
    order().recipient_email = ' Jonathan@Example.com '; // même adresse, casse/espaces différents
    await deliverOnlineGiftCardOrder('order-1');
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]!.attachments).toHaveLength(1);
    expect(extractPdfTextCompact(sentEmails[0]!.attachments![0]!.content)).toContain('2900000000015');
  });

  it("un seul email en mode 'buyer' (déjà le cas par nature, vérifié explicitement)", async () => {
    order().delivery_mode = 'buyer';
    order().recipient_email = 'jonathan@example.com';
    await deliverOnlineGiftCardOrder('order-1');
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]!.to).toBe('jonathan@example.com');
  });
});

describe('idempotence des emails', () => {
  it('appelé deux fois de suite (rejeu) => un seul envoi', async () => {
    await deliverOnlineGiftCardOrder('order-1');
    await deliverOnlineGiftCardOrder('order-1');
    expect(sendOrgEmailMock).toHaveBeenCalledTimes(1);
  });

  it('deux appels "concurrents" (même état initial) => un seul réclame la ligne, un seul envoi', async () => {
    // Simule une course : le premier UPDATE...RETURNING gagne (delivery_status
    // passe à 'sending' avant que le second appel ne lise la ligne).
    await Promise.all([deliverOnlineGiftCardOrder('order-1'), deliverOnlineGiftCardOrder('order-1')]);
    expect(sendOrgEmailMock).toHaveBeenCalledTimes(1);
  });

  it("retry après un précédent échec => réessaie et réussit, sans dupliquer d'envoi", async () => {
    sendShouldFail = true;
    await deliverOnlineGiftCardOrder('order-1');
    expect(order().delivery_status).toBe('failed');
    sendShouldFail = false;
    await deliverOnlineGiftCardOrder('order-1');
    expect(order().delivery_status).toBe('sent');
    expect(sendOrgEmailMock).toHaveBeenCalledTimes(2); // 1 échec + 1 succès, jamais plus
  });

  it("retry après un envoi déjà réussi => aucun nouvel envoi, delivery_status reste 'sent'", async () => {
    await deliverOnlineGiftCardOrder('order-1');
    sendOrgEmailMock.mockClear();
    await deliverOnlineGiftCardOrder('order-1');
    expect(sendOrgEmailMock).not.toHaveBeenCalled();
    expect(order().delivery_status).toBe('sent');
  });
});

describe("échec d'envoi email", () => {
  it("la commande reste 'issued' et gift_card_id renseigné, l'échec de distribution seul est enregistré", async () => {
    sendShouldFail = true;
    await deliverOnlineGiftCardOrder('order-1');
    expect(order().status).toBe('issued'); // jamais modifié par la distribution
    expect(order().gift_card_id).toBe('gift-card-1');
    expect(order().delivery_status).toBe('failed');
    expect(order().delivery_error).toBeTruthy();
  });

  it('delivery_error ne contient jamais le détail technique brut du fournisseur', async () => {
    sendShouldFail = true;
    await deliverOnlineGiftCardOrder('order-1');
    expect(order().delivery_error).not.toContain('Brevo');
    expect(order().delivery_error).not.toContain('connexion refusée');
  });

  it('mode recipient, un seul des deux envois échoue => distribution marquée en échec globalement', async () => {
    order().delivery_mode = 'recipient';
    let call = 0;
    sendOrgEmailMock.mockImplementation(async (args) => {
      call += 1;
      if (call === 2) return { ok: false as const, error: 'PROVIDER_ERROR', detail: '' };
      sentEmails.push(args);
      return { ok: true as const };
    });
    await deliverOnlineGiftCardOrder('order-1');
    expect(order().delivery_status).toBe('failed');
  });
});

describe('échec de génération PDF', () => {
  it("la carte et le paiement restent valides ; aucun email n'est envoyé sans le PDF ; l'échec est journalisé et retentable", async () => {
    pdfShouldFail = true;
    await deliverOnlineGiftCardOrder('order-1');
    expect(order().status).toBe('issued'); // jamais annulé par un échec de PDF
    expect(order().gift_card_id).toBe('gift-card-1');
    expect(sendOrgEmailMock).not.toHaveBeenCalled(); // jamais d'email sans le PDF
    expect(order().delivery_status).toBe('failed');
    expect(order().delivery_error).toBeTruthy();
    expect(order().delivery_error).not.toContain('PDF_RENDER_FAILURE'); // détail technique jamais persisté
  });

  it('un rejeu ultérieur du webhook réessaie la génération PDF sans recréer de carte', async () => {
    pdfShouldFail = true;
    await deliverOnlineGiftCardOrder('order-1');
    expect(order().delivery_status).toBe('failed');
    pdfShouldFail = false;
    await deliverOnlineGiftCardOrder('order-1');
    expect(order().delivery_status).toBe('sent');
    expect(order().gift_card_id).toBe('gift-card-1'); // toujours la même carte
    expect(sendOrgEmailMock).toHaveBeenCalledTimes(1); // un seul envoi au total (le premier a échoué avant l'email)
  });
});

describe('ne réclame jamais une commande non émise ou déjà en cours', () => {
  it("commande encore 'pending' (émission non terminée) => aucun envoi", async () => {
    order().status = 'pending';
    await deliverOnlineGiftCardOrder('order-1');
    expect(sendOrgEmailMock).not.toHaveBeenCalled();
  });

  it("commande sans gift_card_id => aucun envoi (rien à distribuer)", async () => {
    order().gift_card_id = null;
    await deliverOnlineGiftCardOrder('order-1');
    expect(sendOrgEmailMock).not.toHaveBeenCalled();
  });

  it("commande introuvable => aucun envoi, aucune erreur levée", async () => {
    await expect(deliverOnlineGiftCardOrder('does-not-exist')).resolves.toBeUndefined();
    expect(sendOrgEmailMock).not.toHaveBeenCalled();
  });
});

describe('multi-tenant', () => {
  it("utilise l'organisation de LA commande (organization_id), jamais une autre — pas de storeId (null, config email au niveau organisation)", async () => {
    await deliverOnlineGiftCardOrder('order-1');
    expect(sendOrgEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-a-uuid', storeId: null,
    }));
  });

  it("le nom d'organisation dans l'email est celui résolu via gift_cards -> organizations, jamais codé en dur", async () => {
    await deliverOnlineGiftCardOrder('order-1');
    expect(sentEmails[0]!.html).toContain('Plante Verte');
    expect(sentEmails[0]!.html).not.toContain('Fanny Fleurs');
  });
});
