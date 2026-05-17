import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guards';
import { withTransaction } from '@/lib/db/client';
import { FiscalCore } from '@/lib/fiscal/core';

export async function GET() {
  const g = await requirePermission('fiscal.audit');
  if ('response' in g) return g.response;
  const result = await withTransaction(async (client) => {
    const core = new FiscalCore(client);
    return core.verifyChain(g.user.organizationId);
  });
  return NextResponse.json(result);
}
