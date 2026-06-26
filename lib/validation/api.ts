import { z } from 'zod';
import { NextResponse } from 'next/server';

export function jsonError(message: string, status = 400, extras?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extras }, { status });
}

export async function parseJson<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { response: jsonError('INVALID_JSON', 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    // Construit un message lisible : "field: message"
    const fieldErrors = Object.entries(flat.fieldErrors)
      .map(([k, v]) => `${k}: ${(v as string[])[0] ?? 'invalide'}`)
      .slice(0, 3)
      .join(' · ');
    const formErrors = flat.formErrors.join(' · ');
    const message = [fieldErrors, formErrors].filter(Boolean).join(' — ') || 'Données invalides';
    return {
      response: jsonError('VALIDATION_ERROR', 422, {
        issues: flat,
        message,
      }),
    };
  }
  return { data: parsed.data };
}
