import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { requirePermission } from '@/lib/auth/guards';
import { query } from '@/lib/db/client';
import { signWalletToken } from '@/lib/wallet/link-token';
import { audit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

/**
 * Genere un lien signe que le commercant peut envoyer au client
 * (SMS, email, WhatsApp, QR code...). Le client ouvre l'URL sur son
 * iPhone : la carte fidelite est ajoutee a Apple Wallet en 1 tap.
 *
 * Retourne aussi un QR code SVG pour affichage direct sur l'ecran de
 * la caisse (le client scanne avec l'appareil photo iPhone).
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('customers.read');
  if ('response' in g) return g.response;

  // Verifie que le client appartient a l'org du user (evite les
  // liens crees pour des clients hors organisation).
  const exists = await query(
    `SELECT 1 FROM customers WHERE id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (exists.rowCount === 0) {
    return NextResponse.json({ error: 'CUSTOMER_NOT_FOUND' }, { status: 404 });
  }

  const token = await signWalletToken({
    orgId: g.user.organizationId,
    customerId: params.id,
  });

  // Base URL publique de l'app pour construire le lien absolu.
  const origin = new URL(req.url).origin;
  const url = `${origin}/w/${token}`;

  // QR SVG genere cote serveur (lib eprouvee, pas notre encodeur maison)
  let qr: string;
  try {
    qr = await QRCode.toString(url, {
      type: 'svg', errorCorrectionLevel: 'M', margin: 1, width: 240,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[wallet.link.qr]', err);
    qr = '';
  }

  await audit({
    organizationId: g.user.organizationId,
    userId: g.user.id,
    action: 'wallet.link.create',
    entityType: 'customer',
    entityId: params.id,
  });

  return NextResponse.json({ url, qr });
}
