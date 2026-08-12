import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { query, withTransaction } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { audit } from '@/lib/audit/log';
import {
  mergeWithDefaults, POS_UI_KEY, loyaltyGroupKey, type PosUiSettings,
} from '@/lib/settings/pos-ui';
import { CUSTOMER_IMPORT_COLUMNS, CUSTOMER_TYPES, parseBool } from '@/lib/customers/import-columns';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_ROWS = 5000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Normalise une valeur de cellule exceljs (texte, lien, formule, richText). */
function cellStr(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.text === 'string') return o.text.trim();
    if (typeof o.result === 'string' || typeof o.result === 'number') return String(o.result).trim();
    if (Array.isArray(o.richText)) return o.richText.map((r) => (r as { text?: string }).text ?? '').join('').trim();
    if (o.hyperlink && typeof o.text === 'string') return String(o.text).trim();
  }
  return String(v).trim();
}

export async function POST(req: Request) {
  const g = await requirePermission('customers.write');
  if ('response' in g) return g.response;

  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ error: 'BAD_REQUEST', message: 'Fichier manquant.' }, { status: 400 }); }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'NO_FILE', message: 'Sélectionnez un fichier Excel (.xlsx).' }, { status: 400 });
  }
  let storeIds: string[] = [];
  try { storeIds = JSON.parse(String(form.get('store_ids') ?? '[]')); } catch { /* ignore */ }
  storeIds = Array.isArray(storeIds) ? storeIds.filter((s) => typeof s === 'string' && UUID_RE.test(s)) : [];
  if (storeIds.length === 0) {
    return NextResponse.json({ error: 'NO_STORE', message: 'Choisissez au moins une boutique.' }, { status: 400 });
  }

  // Boutiques valides de l'organisation (garde-fou).
  const storesRes = await query<{ id: string }>(
    `SELECT id FROM stores WHERE organization_id = $1 AND id = ANY($2::uuid[])`,
    [g.user.organizationId, storeIds],
  );
  const validStoreIds = storesRes.rows.map((r) => r.id);
  if (validStoreIds.length === 0) {
    return NextResponse.json({ error: 'NO_STORE', message: 'Boutique(s) inconnue(s).' }, { status: 400 });
  }

  // Config fidélité : détermine la clé de groupe (commun / par boutique / groupé).
  const uiRes = await query<{ value: Partial<PosUiSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [g.user.organizationId, POS_UI_KEY],
  );
  const ui = mergeWithDefaults(uiRes.rows[0]?.value ?? null);
  const groupKeys = [...new Set(validStoreIds.map((sid) => loyaltyGroupKey(ui.loyalty, sid)))];
  // Conversion points (ancien logiciel) → euros de fidélité. L'app stocke le
  // solde fidélité en euros (1 « point » applicatif = 1 €), alors que le fichier
  // repris compte en POINTS (barème ex. 100 pts = 5 €). On applique le taux
  // euros_earned / per_euros_spent (défaut 0,05 €/point).
  const loyRate = ui.loyalty.per_euros_spent > 0
    ? ui.loyalty.euros_earned / ui.loyalty.per_euros_spent
    : 0.05;

  // Lecture du classeur.
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(Buffer.from(await file.arrayBuffer())); }
  catch { return NextResponse.json({ error: 'BAD_FILE', message: 'Fichier illisible : utilisez le modèle Excel fourni.' }, { status: 400 }); }
  const ws = wb.worksheets[0];
  if (!ws) return NextResponse.json({ error: 'EMPTY', message: 'Fichier vide.' }, { status: 400 });

  // Repérage des colonnes par leur en-tête (ligne 1).
  const headerToKey = new Map(CUSTOMER_IMPORT_COLUMNS.map((c) => [c.header.trim().toLowerCase(), c.key]));
  const colByKey: Record<string, number> = {};
  ws.getRow(1).eachCell((cell, col) => {
    const key = headerToKey.get(cellStr(cell.value).toLowerCase());
    if (key) colByKey[key] = col;
  });
  if (colByKey.type === undefined && colByKey.first_name === undefined && colByKey.company_name === undefined) {
    return NextResponse.json({ error: 'BAD_HEADERS', message: 'En-têtes non reconnues : utilisez le modèle Excel fourni.' }, { status: 400 });
  }

  const result = { created: 0, updated: 0, loyalty_updated: 0, skipped: 0, errors: [] as { row: number; message: string }[] };
  const lastRow = Math.min(ws.rowCount, MAX_ROWS + 1);

  for (let r = 2; r <= lastRow; r++) {
    const row = ws.getRow(r);
    const val = (key: string) => (colByKey[key] ? cellStr(row.getCell(colByKey[key]).value) : '');

    const first = val('first_name'), last = val('last_name'), company = val('company_name');
    const email = val('email'), phone = val('phone');
    // Ligne entièrement vide → on ignore silencieusement.
    if (![first, last, company, email, phone].some((v) => v)) continue;

    let type = val('type').toLowerCase();
    if (!(CUSTOMER_TYPES as readonly string[]).includes(type)) {
      // Type absent/inconnu : société sans nom → professionnel, sinon particulier.
      type = company && !(first || last) ? 'professionnel' : 'particulier';
    }
    const isParticulier = type === 'particulier';
    if (isParticulier ? !(first || last) : !company) {
      result.errors.push({ row: r, message: isParticulier ? 'Nom/prénom manquant.' : 'Société manquante.' });
      continue;
    }

    const address = { line1: val('line1'), zip: val('zip'), city: val('city') };
    const pointsRaw = val('loyalty_points');
    const hasPoints = pointsRaw !== '';
    const rawPoints = hasPoints ? Number(pointsRaw.replace(',', '.')) : 0;
    if (hasPoints && !Number.isFinite(rawPoints)) {
      result.errors.push({ row: r, message: `Points fidélité invalides (« ${pointsRaw} »).` });
      continue;
    }
    // Solde fidélité converti en euros (voir loyRate).
    const points = hasPoints ? Math.round(rawPoints * loyRate * 100) / 100 : 0;

    try {
      await withTransaction(async (client) => {
        // Upsert client (reconnaissance par email).
        let customerId: string | null = null;
        if (email) {
          const ex = await client.query<{ id: string }>(
            // Une fiche archivée ne sert plus de point d'ancrage : la mettre à
            // jour la laisserait invisible, l'import semblerait sans effet.
            // L'email retrouve alors une fiche neuve et active.
            `SELECT id FROM customers
              WHERE organization_id = $1 AND email = $2 AND is_anonymized = FALSE
                AND archived_at IS NULL
              LIMIT 1`,
            [g.user.organizationId, email],
          );
          customerId = ex.rows[0]?.id ?? null;
        }
        if (customerId) {
          await client.query(
            `UPDATE customers SET
               type = $2, first_name = $3, last_name = $4, company_name = $5,
               phone = COALESCE(NULLIF($6,''), phone),
               siret = COALESCE(NULLIF($7,''), siret),
               vat_number = COALESCE(NULLIF($8,''), vat_number),
               address = CASE WHEN $9::jsonb <> '{}'::jsonb THEN $9::jsonb ELSE address END,
               consent_email = $10, consent_sms = $11,
               internal_notes = COALESCE(NULLIF($12,''), internal_notes),
               loyalty_code = COALESCE(NULLIF($13,''), loyalty_code),
               updated_at = now(), updated_by = $14
             WHERE id = $1`,
            [customerId, type, first || null, last || null, company || null,
             phone, val('siret'), val('vat_number'),
             JSON.stringify(cleanAddr(address)),
             parseBool(val('consent_email')), parseBool(val('consent_sms')),
             val('internal_notes'), val('loyalty_code'), g.user.id],
          );
          result.updated++;
        } else {
          const ins = await client.query<{ id: string }>(
            `INSERT INTO customers
               (organization_id, type, first_name, last_name, company_name,
                email, phone, siret, vat_number, address,
                consent_email, consent_sms, internal_notes, loyalty_code,
                created_by, updated_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15)
             RETURNING id`,
            [g.user.organizationId, type, first || null, last || null, company || null,
             email || null, phone || null, val('siret') || null, val('vat_number') || null,
             JSON.stringify(cleanAddr(address)),
             parseBool(val('consent_email')), parseBool(val('consent_sms')),
             val('internal_notes') || null, val('loyalty_code') || null, g.user.id],
          );
          customerId = ins.rows[0]!.id;
          result.created++;
        }

        // Points de fidélité : crédités sur la (les) boutique(s) choisie(s).
        if (hasPoints && customerId) {
          for (const gk of groupKeys) {
            const acc = await client.query<{ id: string; points_balance: string }>(
              `SELECT id, points_balance::text FROM loyalty_accounts
                WHERE customer_id = $1 AND group_key = $2 FOR UPDATE`,
              [customerId, gk],
            );
            let accId: string; let prev = 0;
            if (acc.rows[0]) {
              accId = acc.rows[0].id; prev = Number(acc.rows[0].points_balance);
              await client.query(`UPDATE loyalty_accounts SET points_balance = $2, updated_at = now() WHERE id = $1`, [accId, points]);
            } else {
              const insAcc = await client.query<{ id: string }>(
                `INSERT INTO loyalty_accounts (organization_id, customer_id, points_balance, group_key)
                 VALUES ($1,$2,$3,$4) RETURNING id`,
                [g.user.organizationId, customerId, points, gk],
              );
              accId = insAcc.rows[0]!.id;
            }
            if (points !== prev) {
              await client.query(
                `INSERT INTO loyalty_movements
                   (organization_id, account_id, movement_type, points_delta, balance_after, reason, source_type, user_id)
                 VALUES ($1,$2,'adjust',$3,$4,'Import fichier clients','import',$5)`,
                [g.user.organizationId, accId, points - prev, points, g.user.id],
              );
            }
          }
          result.loyalty_updated++;
        }
      });
    } catch (err) {
      result.errors.push({ row: r, message: (err as Error).message?.slice(0, 160) ?? 'Erreur.' });
      result.skipped++;
    }
  }

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'customers.import', entityType: 'customer', entityId: null,
    payload: { created: result.created, updated: result.updated, loyalty_updated: result.loyalty_updated, stores: validStoreIds, errors: result.errors.length },
  });

  return NextResponse.json(result);
}

function cleanAddr(a: { line1: string; zip: string; city: string }): Record<string, string> {
  const out: Record<string, string> = {};
  if (a.line1) out.line1 = a.line1;
  if (a.zip) out.zip = a.zip;
  if (a.city) out.city = a.city;
  return out;
}
