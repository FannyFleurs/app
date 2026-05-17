import { query } from '@/lib/db/client';

export type AuditSeverity = 'info' | 'warn' | 'error' | 'security';

export interface AuditInput {
  organizationId: string | null;
  userId: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  payload?: Record<string, unknown>;
  severity?: AuditSeverity;
}

export async function audit(input: AuditInput): Promise<void> {
  await query(
    `INSERT INTO audit_logs
       (organization_id, user_id, action, entity_type, entity_id,
        ip, user_agent, payload, severity)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      input.organizationId,
      input.userId,
      input.action,
      input.entityType ?? null,
      input.entityId ?? null,
      input.ip ?? null,
      input.userAgent ?? null,
      JSON.stringify(input.payload ?? {}),
      input.severity ?? 'info',
    ],
  );
}
