import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { decodeJwt } from 'jose';
import { query } from '@/lib/db/client';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { audit } from '@/lib/audit/log';
import { SUPPORT_REQUEST_COOKIE } from '@/lib/support-access/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SUBS = ['app.', 'bo.', 'ca.', 'admin.', 'pda.', 'ecran.', 'www.'];

function adminUrl(): string {
  const host = (headers().get('host') ?? '').toLowerCase().split(':')[0] ?? '';
  const preview = !host || host === 'localhost' || host.endsWith('.vercel.app');
  if (preview) return '/admin';
  const base = SUBS.reduce((h, s) => (h.startsWith(s) ? h.slice(s.length) : h), host);
  return `https://admin.${base}`;
}

/**
 * Fin de dépannage : révoque la session d'impersonation, clôt la demande et
 * efface les cookies. La session admin d'origine (sous-domaine admin.) est
 * restée intacte : on y renvoie l'opérateur.
 */
export async function POST() {
  const store = cookies();
  const rid = store.get(SUPPORT_REQUEST_COOKIE)?.value;
  const sessionJwt = store.get(SESSION_COOKIE)?.value;

  // Révoque la session de dépannage courante.
  if (sessionJwt) {
    try {
      const jti = String((decodeJwt(sessionJwt) as { jti?: string }).jti ?? '');
      if (jti) await query(`UPDATE sessions SET revoked_at = now() WHERE id = $1`, [jti]);
    } catch { /* jwt illisible : on continue */ }
  }

  if (rid) {
    try {
      const r = await query<{ organization_id: string }>(
        `UPDATE support_access_requests
            SET status = 'ended', ended_at = now()
          WHERE id = $1 AND status = 'approved'
          RETURNING organization_id`,
        [rid],
      );
      if (r.rowCount > 0) {
        await audit({
          organizationId: r.rows[0]!.organization_id, userId: null,
          action: 'support.access.ended',
          entityType: 'support_access', entityId: rid, severity: 'security',
        });
      }
    } catch { /* ignore */ }
  }

  const res = NextResponse.json({ ok: true, redirect: adminUrl() });
  // Efface le cookie de session (déconnecte du dépannage) et le marqueur.
  res.cookies.set({ name: SESSION_COOKIE, value: '', path: '/', maxAge: 0 });
  res.cookies.set({ name: SUPPORT_REQUEST_COOKIE, value: '', path: '/', maxAge: 0 });
  return res;
}
