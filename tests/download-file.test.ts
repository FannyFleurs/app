// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { downloadFile } from '@/lib/ui/download-file';

/**
 * Téléchargement des PDF générés côté serveur (facture, avoir, ticket).
 *
 * Dans l'app native (Capacitor), un lien classique `target="_blank"` vers une
 * route authentifiée bascule sur Safari, qui n'a pas la session de la
 * WebView embarquée — la réponse y arrive en erreur (401) au lieu du PDF
 * (voir lib/ui/download-file.ts). `downloadFile` fetch le PDF depuis la page
 * elle-même (session valide) puis le télécharge localement, sans jamais
 * naviguer vers l'URL du serveur.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('downloadFile', () => {
  it('récupère le PDF par fetch puis déclenche un téléchargement local (pas de navigation)', async () => {
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    const fetchMock = vi.fn(async () => ({ ok: true, blob: async () => blob }) as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    const createObjectURL = vi.fn(() => 'blob:fake-url');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

    let clicked = false;
    let downloadAttr = '';
    let hrefAttr = '';
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreateElement(tag);
      if (tag === 'a') {
        Object.defineProperty(el, 'click', { value: () => { clicked = true; } });
      }
      return el;
    });

    const ok = await downloadFile('/api/invoices/1/pdf', 'facture-F2026-001.pdf');

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/api/invoices/1/pdf');
    expect(clicked).toBe(true);
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
  });

  it('renvoie false si le serveur répond une erreur (ex. session absente)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false }) as unknown as Response));
    expect(await downloadFile('/api/invoices/1/pdf', 'facture.pdf')).toBe(false);
  });

  it('renvoie false si le réseau échoue, sans lever d\'exception', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }));
    await expect(downloadFile('/api/invoices/1/pdf', 'facture.pdf')).resolves.toBe(false);
  });
});

describe('Les liens PDF de Ma Journée ne naviguent plus vers la route authentifiée', () => {
  const maJournee = readFileSync('app/(app)/ma-journee/MaJourneeClient.tsx', 'utf8');
  const receiptPrint = readFileSync('lib/pos/receipt-print.ts', 'utf8');

  it('facture et avoirs passent par downloadFile, plus par target="_blank"', () => {
    expect(maJournee).toContain("downloadFile(`/api/invoices/");
    expect(maJournee).toContain("downloadFile(");
    const creditNoteDownloads = maJournee.match(/downloadFile\(\s*`\/api\/credit-notes\//g) ?? [];
    expect(creditNoteDownloads.length).toBe(2);
    expect(maJournee).not.toMatch(/href=\{`\/api\/(invoices|credit-notes)\/[^}]*\}\s*target="_blank"/);
  });

  it('le repli PDF du ticket télécharge aussi au lieu de naviguer', () => {
    expect(receiptPrint).toContain('downloadFile(');
    expect(receiptPrint).not.toContain('window.open');
  });
});
