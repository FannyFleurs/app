import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { sendOrgEmail } from '@/lib/email/send';
import {
  EMAIL_KEY, mergeEmailDefaults, maskApiKey, type EmailSettings,
} from '@/lib/settings/email';

export const dynamic = 'force-dynamic';

async function load(orgId: string): Promise<EmailSettings> {
  const { rows } = await query<{ value: Partial<EmailSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [orgId, EMAIL_KEY],
  );
  return mergeEmailDefaults(rows[0]?.value ?? null);
}

export async function GET() {
  const g = await requirePermission('settings.read');
  if ('response' in g) return g.response;
  const s = await load(g.user.organizationId);
  return NextResponse.json({
    settings: {
      enabled: s.enabled,
      provider: s.provider,
      sender_email: s.sender_email,
      sender_name: s.sender_name,
      auto_send_invoice: s.auto_send_invoice,
      auto_send_receipt: s.auto_send_receipt,
      api_key: '',                        // jamais renvoyée en clair
      api_key_masked: s.api_key ? maskApiKey(s.api_key) : '',
      api_key_set: !!s.api_key,
    },
  });
}

const schema = z.object({
  enabled: z.boolean().optional(),
  api_key: z.string().max(200).optional(),
  sender_email: z.string().email().or(z.literal('')).optional(),
  sender_name: z.string().max(120).optional(),
  auto_send_invoice: z.boolean().optional(),
  auto_send_receipt: z.boolean().optional(),
  /** Envoi d'un email de test à cette adresse (ne modifie pas la config). */
  test_to: z.string().email().optional(),
});

export async function PATCH(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;

  const existing = await load(g.user.organizationId);

  // Test d'envoi (avant sauvegarde éventuelle) : utilise la config existante.
  // `allowDisabled` : on peut tester la clé/expéditeur avant d'activer l'envoi.
  if (d.test_to) {
    if (!existing.api_key || !existing.sender_email) {
      return NextResponse.json({
        error: 'NOT_CONFIGURED',
        message: 'Renseigne la clé API Brevo et l’email expéditeur, puis clique sur « Enregistrer » avant de tester.',
      }, { status: 400 });
    }
    const res = await sendOrgEmail({
      organizationId: g.user.organizationId,
      to: d.test_to,
      subject: 'Test d’envoi HelloPos',
      html: '<p>Ceci est un email de test envoyé depuis HelloPos via Brevo. '
        + 'Si vous le recevez, la configuration est correcte ✅.</p>',
      allowDisabled: true,
    });
    if (!res.ok) {
      const message = res.error === 'NOT_CONFIGURED'
        ? 'Renseigne la clé API Brevo et l’email expéditeur, puis enregistre avant de tester.'
        : `Brevo a refusé l’envoi : ${res.detail ?? 'erreur inconnue'}. `
          + 'Vérifie que la clé est une clé « API v3 » valide et que l’expéditeur est vérifié dans Brevo.';
      return NextResponse.json({ error: res.error, detail: res.detail, message }, { status: 400 });
    }
    return NextResponse.json({ tested: true });
  }

  const next: EmailSettings = {
    ...existing,
    enabled: d.enabled ?? existing.enabled,
    sender_email: d.sender_email ?? existing.sender_email,
    sender_name: d.sender_name ?? existing.sender_name,
    auto_send_invoice: d.auto_send_invoice ?? existing.auto_send_invoice,
    auto_send_receipt: d.auto_send_receipt ?? existing.auto_send_receipt,
    // Clé : conservée si non fournie / vide (le front envoie vide = inchangé).
    api_key: d.api_key && d.api_key.trim() ? d.api_key.trim() : existing.api_key,
    provider: 'brevo',
  };

  await query(
    `INSERT INTO settings (organization_id, key, value, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (organization_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [g.user.organizationId, EMAIL_KEY, JSON.stringify(next)],
  );
  return NextResponse.json({ ok: true });
}
