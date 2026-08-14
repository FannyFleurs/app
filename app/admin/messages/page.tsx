import { query } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

interface ContactMessage {
  id: string;
  name: string;
  shop: string;
  email: string;
  phone: string;
  message: string;
  created_at: string;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default async function MessagesPage() {
  let rows: ContactMessage[] = [];
  try {
    const res = await query<ContactMessage>(
      `SELECT id, name, shop, email, phone, message, created_at
         FROM contact_messages
        ORDER BY created_at DESC
        LIMIT 200`,
    );
    rows = res.rows;
  } catch {
    // Migration 0068 non appliquée : liste vide.
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Demandes de contact</h1>
      <p className="text-sm text-ink-soft mb-5">
        Demandes de démo reçues depuis le site vitrine. Une notification email
        est aussi envoyée à l&apos;adresse de contact de la plateforme.
      </p>

      {rows.length === 0 ? (
        <div className="card p-8 text-center text-ink-soft">
          Aucune demande pour le moment.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((m) => (
            <div key={m.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-ink">
                    {m.name}
                    {m.shop ? <span className="text-ink-soft font-normal"> · {m.shop}</span> : null}
                  </div>
                  <div className="mt-0.5 text-sm text-ink-soft">
                    <a href={`mailto:${m.email}`} className="hover:underline">{m.email}</a>
                    {m.phone ? <span> · {m.phone}</span> : null}
                  </div>
                </div>
                <div className="text-xs text-ink-soft whitespace-nowrap">{formatDate(m.created_at)}</div>
              </div>
              {m.message ? (
                <p className="mt-3 text-sm text-ink whitespace-pre-wrap">{m.message}</p>
              ) : null}
              <div className="mt-3">
                <a
                  href={`mailto:${m.email}?subject=${encodeURIComponent('Votre demande de démo HelloPos')}`}
                  className="btn-soft inline-flex text-sm"
                >
                  Répondre
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
