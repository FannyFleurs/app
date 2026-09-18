import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { REVENUE_COLUMNS } from '@/lib/analytics/revenue-history-parse';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Modèle Excel (.xlsx) pour l'import de l'historique de CA (comparatif N-1).
 * Entêtes en français, pré-rempli d'exemples utilisant les VRAIS noms de
 * boutiques de l'organisation, pour que l'appariement par nom soit évident.
 */
export async function GET() {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;

  const stores = await query<{ name: string }>(
    `SELECT name FROM stores WHERE organization_id = $1 AND is_active = TRUE ORDER BY name`,
    [g.user.organizationId],
  );
  const names = stores.rows.map((r) => r.name);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'HelloPos';
  const ws = wb.addWorksheet('Historique CA');
  ws.columns = REVENUE_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: 'middle' };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  // Deux jours d'exemple pour chaque boutique connue (sinon un exemple neutre).
  const exampleStores = names.length > 0 ? names : ['Ma boutique'];
  for (const name of exampleStores) {
    ws.addRow({ day: '31/12/2025', store: name, ca_ttc: '1250,00', ca_ht: '1041,67', tickets: 42 });
    ws.addRow({ day: '30/12/2025', store: name, ca_ttc: '980,50', ca_ht: '817,08', tickets: 31 });
  }

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="modele-historique-ca.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}
