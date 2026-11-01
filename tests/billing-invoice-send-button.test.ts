import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Facturation (back-office) : un bouton « Envoyer » sur chaque ligne de
 * facture permet l'envoi par email sans passer par la page détail facture.
 * Envoi automatique si le client a déjà un email en fiche, sinon demande
 * d'adresse via la même modale que la page détail (SendInvoiceEmailModal,
 * partagée avec InvoiceActions.tsx).
 *
 * BillingManager.tsx est un gros composant client, sans rendu complet en
 * test (même choix que CashRegister.tsx, voir caisse-loyalty-editable-amount
 * .test.ts) : on vérifie la présence et le câblage exact sur la source.
 */
describe('Facturation — bouton « Envoyer » sur la ligne de facture', () => {
  const page = readFileSync('app/(app)/billing/BillingManager.tsx', 'utf8');

  it('importe la modale partagée avec la page détail facture', () => {
    expect(page).toMatch(/import SendInvoiceEmailModal from '@\/components\/SendInvoiceEmailModal';/);
  });

  it('le type Detail porte désormais l\'email du client', () => {
    expect(page).toMatch(/customer: \{ id: string; name: string; account_balance: number; email: string \| null \};/);
  });

  it('sendInvoice poste sur /api/invoices/:id/email, avec email optionnel', () => {
    expect(page).toMatch(/async function sendInvoice\(invoiceId: string, email\?: string\)/);
    expect(page).toMatch(/fetch\(`\/api\/invoices\/\$\{invoiceId\}\/email`/);
  });

  it('onSendClick envoie directement si le client a un email, sinon ouvre la modale', () => {
    expect(page).toMatch(/function onSendClick\(inv: InvoiceRow\) \{\s*if \(detail\?\.customer\.email\) \{\s*void sendInvoice\(inv\.id\);\s*\} else \{[\s\S]{0,60}setEmailModalFor\(inv\);/);
  });

  it('le bouton "Envoyer" de la ligne appelle onSendClick avec son invoice', () => {
    expect(page).toMatch(/onClick=\{\(\) => onSendClick\(i\)\}/);
    expect(page).toMatch(/\{sendingId === i\.id \? 'Envoi…' : 'Envoyer'\}/);
  });

  it('un état "Envoyée" remplace le bouton une fois l\'envoi terminé', () => {
    expect(page).toMatch(/sentId === i\.id \? \(\s*<span className="text-xs text-success[\s\S]{0,20}✓ Envoyée/);
  });

  it('la modale, quand ouverte, envoie vers sendInvoice avec l\'email saisi', () => {
    expect(page).toMatch(/\{emailModalFor && \(\s*<SendInvoiceEmailModal/);
    expect(page).toMatch(/onSend=\{\(email\) => sendInvoice\(emailModalFor\.id, email\)\}/);
  });
});

describe('API /api/billing/customers/[id] — expose l\'email du client', () => {
  const src = readFileSync('app/api/billing/customers/[id]/route.ts', 'utf8');

  it('la requête SQL sélectionne désormais email', () => {
    expect(src).toMatch(/COALESCE\(account_balance, 0\)::text AS account_balance,\s*email/);
  });

  it('la réponse JSON inclut customer.email', () => {
    expect(src).toMatch(/email: customer\.rows\[0\]!\.email,/);
  });
});
