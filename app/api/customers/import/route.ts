import { NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { audit } from '@/lib/audit/log';
import {
  mergeWithDefaults, POS_UI_KEY, loyaltyGroupKey, type PosUiSettings,
} from '@/lib/settings/pos-ui';
import {
  parseCustomerWorkbook, buildIndex, addToIndex, matchRow, type ExistingCustomer,
} from '@/lib/customers/import-core';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const round2 = (n: number) => Math.round(n * 100) / 100;

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
  // Mode correction (fichier réexporté depuis HelloPos puis corrigé à la
  // main) : les colonnes points/solde sont des CIBLES déjà en points/euros
  // (pas des montants à cumuler) — seul l'écart avec la valeur actuelle est
  // appliqué, une cellule inchangée ne produit donc aucune écriture.
  const correctionMode = form.get('correction_mode') === 'true';
  let storeIds: string[] = [];
  try { storeIds = JSON.parse(String(form.get('store_ids') ?? '[]')); } catch { /* ignore */ }
  storeIds = Array.isArray(storeIds) ? storeIds.filter((s) => typeof s === 'string' && UUID_RE.test(s)) : [];
  if (storeIds.length === 0) {
    return NextResponse.json({ error: 'NO_STORE', message: 'Choisissez au moins une boutique.' }, { status: 400 });
  }

  const storesRes = await query<{ id: string }>(
    `SELECT id FROM stores WHERE organization_id = $1 AND id = ANY($2::uuid[])`,
    [g.user.organizationId, storeIds],
  );
  const validStoreIds = storesRes.rows.map((r) => r.id);
  if (validStoreIds.length === 0) {
    return NextResponse.json({ error: 'NO_STORE', message: 'Boutique(s) inconnue(s).' }, { status: 400 });
  }

  // Config fidélité : clés de groupe (commun / par boutique / groupé) + taux.
  const uiRes = await query<{ value: Partial<PosUiSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [g.user.organizationId, POS_UI_KEY],
  );
  const ui = mergeWithDefaults(uiRes.rows[0]?.value ?? null);
  const groupKeys = [...new Set(validStoreIds.map((sid) => loyaltyGroupKey(ui.loyalty, sid)))];
  const loyRate = ui.loyalty.per_euros_spent > 0
    ? ui.loyalty.euros_earned / ui.loyalty.per_euros_spent : 0.05;

  const { headerError, rows } = await parseCustomerWorkbook(Buffer.from(await file.arrayBuffer()), loyRate, correctionMode);
  if (headerError) return NextResponse.json({ error: 'BAD_FILE', message: headerError }, { status: 400 });

  // Fiches existantes -> index de rapprochement (code fidélité / e-mail /
  // téléphone / nom) + solde actuel (nécessaire en mode correction, pour
  // calculer l'écart plutôt que d'additionner aveuglément).
  const existing = await query<ExistingCustomer & { account_balance: string }>(
    `SELECT id, email, phone, first_name, last_name, company_name, loyalty_code, account_balance::text
       FROM customers
      WHERE organization_id = $1 AND is_anonymized = FALSE AND archived_at IS NULL`,
    [g.user.organizationId],
  );
  const idx = buildIndex(existing.rows);
  const existingById = new Map(existing.rows.map((r) => [r.id, r]));

  const result = { created: 0, updated: 0, ambiguous: 0, loyalty_updated: 0, balance_updated: 0, skipped: 0, errors: [] as { row: number; message: string }[] };

  for (const row of rows) {
    if (row.error) { result.errors.push({ row: row.rowNumber, message: row.error }); result.skipped++; continue; }
    const m = matchRow(row, idx);
    try {
      await withTransaction(async (client) => {
        let customerId: string;
        if (m.action === 'update' && m.matchId) {
          customerId = m.matchId;
          // Fusion : on met à jour la fiche existante. L'e-mail n'est PAS écrasé
          // (clé possible d'unicité) ; les autres champs sont complétés.
          // Solde dû (account_balance) : par défaut CUMULÉ (comme les points)
          // — un client peut déjà avoir un encours réel accumulé en caisse
          // (ventes "Différé client" sur plusieurs boutiques, le solde n'est
          // pas scindé par boutique) ; écraser ce solde avec la seule valeur
          // du fichier effacerait silencieusement une vraie dette. Colonne
          // vide = aucun effet. En mode correction, la colonne est la cible
          // exacte à atteindre (fichier réexporté puis corrigé à la main).
          const prevBalance = Number(existingById.get(customerId)?.account_balance ?? 0);
          const finalBalance = !row.hasBalanceDue
            ? prevBalance
            : correctionMode ? round2(-row.balanceDue) : round2(prevBalance - row.balanceDue);
          await client.query(
            `UPDATE customers SET
               type = $2, first_name = initcap($3), last_name = initcap($4), company_name = $5,
               phone = COALESCE(NULLIF($6,''), phone),
               siret = COALESCE(NULLIF($7,''), siret),
               vat_number = COALESCE(NULLIF($8,''), vat_number),
               address = CASE WHEN $9::jsonb <> '{}'::jsonb THEN $9::jsonb ELSE address END,
               consent_email = $10, consent_sms = $11,
               internal_notes = COALESCE(NULLIF($12,''), internal_notes),
               loyalty_code = COALESCE(NULLIF($13,''), loyalty_code),
               account_balance = $15::numeric,
               updated_at = now(), updated_by = $14
             WHERE id = $1`,
            [customerId, row.type, row.first || null, row.last || null, row.company || null,
             row.phone, row.siret, row.vat_number,
             JSON.stringify(cleanAddr(row.address)),
             row.consent_email, row.consent_sms,
             row.internal_notes, row.loyalty_code, g.user.id,
             finalBalance],
          );
          result.updated++;
          if (finalBalance !== prevBalance) result.balance_updated++;
        } else {
          const ins = await client.query<{ id: string }>(
            `INSERT INTO customers
               (organization_id, type, first_name, last_name, company_name,
                email, phone, siret, vat_number, address,
                consent_email, consent_sms, internal_notes, loyalty_code,
                account_balance, created_by, updated_by)
             VALUES ($1,$2,initcap($3),initcap($4),$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16)
             RETURNING id`,
            [g.user.organizationId, row.type, row.first || null, row.last || null, row.company || null,
             row.email || null, row.phone || null, row.siret || null, row.vat_number || null,
             JSON.stringify(cleanAddr(row.address)),
             row.consent_email, row.consent_sms,
             row.internal_notes || null, row.loyalty_code || null,
             row.hasBalanceDue ? -row.balanceDue : 0, g.user.id],
          );
          if (row.hasBalanceDue && row.balanceDue !== 0) result.balance_updated++;
          customerId = ins.rows[0]!.id;
          if (m.action === 'ambiguous') result.ambiguous++; else result.created++;
          // Dédoublonne aussi deux lignes identiques DU MÊME fichier.
          addToIndex(idx, {
            id: customerId, email: row.email || null, phone: row.phone || null,
            first_name: row.first || null, last_name: row.last || null, company_name: row.company || null,
            loyalty_code: row.loyalty_code || null,
          });
        }

        // Points de fidélité : par défaut CUMULÉS sur le solde du (des)
        // groupe(s) choisi(s) — « rapatriement », on ajoute au solde existant
        // plutôt que de l'écraser, pour ne jamais perdre les points d'une
        // autre boutique. En mode correction, la colonne du fichier est la
        // cible exacte : seul l'ÉCART avec le solde actuel est appliqué —
        // une cellule inchangée depuis l'export ne produit aucune écriture.
        if (row.hasPoints && (correctionMode || row.points !== 0)) {
          let anyChange = false;
          for (const gk of groupKeys) {
            const acc = await client.query<{ id: string; points_balance: string }>(
              `SELECT id, points_balance::text FROM loyalty_accounts
                WHERE customer_id = $1 AND group_key = $2 FOR UPDATE`,
              [customerId, gk],
            );
            const prev = acc.rows[0] ? Number(acc.rows[0].points_balance) : 0;
            const delta = round2(correctionMode ? row.points - prev : row.points);
            if (delta === 0) continue;
            anyChange = true;
            const next = round2(prev + delta);
            let accId: string;
            if (acc.rows[0]) {
              accId = acc.rows[0].id;
              await client.query(`UPDATE loyalty_accounts SET points_balance = $2, updated_at = now() WHERE id = $1`, [accId, next]);
            } else {
              const insAcc = await client.query<{ id: string }>(
                `INSERT INTO loyalty_accounts (organization_id, customer_id, points_balance, group_key)
                 VALUES ($1,$2,$3,$4) RETURNING id`,
                [g.user.organizationId, customerId, next, gk],
              );
              accId = insAcc.rows[0]!.id;
            }
            await client.query(
              `INSERT INTO loyalty_movements
                 (organization_id, account_id, movement_type, points_delta, balance_after, reason, source_type, user_id)
               VALUES ($1,$2,'adjust',$3,$4,$6,'import',$5)`,
              [g.user.organizationId, accId, delta, next, g.user.id,
               correctionMode ? 'Import fichier clients (correction)' : 'Import fichier clients (rapatriement)'],
            );
          }
          if (anyChange) result.loyalty_updated++;
        }
      });
    } catch (err) {
      result.errors.push({ row: row.rowNumber, message: (err as Error).message?.slice(0, 160) ?? 'Erreur.' });
      result.skipped++;
    }
  }

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'customers.import', entityType: 'customer', entityId: null,
    payload: { created: result.created, updated: result.updated, ambiguous: result.ambiguous, loyalty_updated: result.loyalty_updated, balance_updated: result.balance_updated, stores: validStoreIds, errors: result.errors.length, correction_mode: correctionMode },
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
