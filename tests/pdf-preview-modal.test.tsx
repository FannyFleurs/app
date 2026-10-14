// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import PdfPreviewModal from '@/components/PdfPreviewModal';

/**
 * Modale d'aperçu PDF (facture, avoirs — Ma Journée).
 *
 * Remplace un téléchargement silencieux (`downloadFile`) qui, au clic, ne
 * donnait aucun signe de vie tant que le fichier n'était pas retrouvé dans
 * les téléchargements du navigateur — « rien ne se passe » du point de vue
 * de l'utilisateur. La modale affiche systématiquement un état visible :
 * chargement, aperçu, ou erreur.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubBlobUrl() {
  vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:fake-preview'), revokeObjectURL: vi.fn() });
}

describe('PdfPreviewModal', () => {
  it('affiche un état de chargement puis l\'aperçu une fois le PDF récupéré', async () => {
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => blob }) as unknown as Response));
    stubBlobUrl();

    render(<PdfPreviewModal url="/api/invoices/1/pdf" title="Facture F-2026-000001" filename="facture.pdf" onClose={() => {}} />);

    expect(screen.getByText('Chargement…')).toBeTruthy();
    await waitFor(() => {
      const iframe = document.querySelector('iframe');
      expect(iframe?.getAttribute('src')).toBe('blob:fake-preview');
    });
    expect(screen.getByText('Imprimer')).toBeTruthy();
    const dl = screen.getByText('Télécharger') as HTMLAnchorElement;
    expect(dl.getAttribute('href')).toBe('blob:fake-preview');
    expect(dl.getAttribute('download')).toBe('facture.pdf');
  });

  it('affiche une erreur si le serveur refuse (ex. session absente) — jamais un échec silencieux', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false }) as unknown as Response));
    render(<PdfPreviewModal url="/api/invoices/1/pdf" title="Facture" filename="facture.pdf" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/introuvable/i)).toBeTruthy());
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('le bouton fermer appelle onClose', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false }) as unknown as Response));
    const onClose = vi.fn();
    render(<PdfPreviewModal url="/api/invoices/1/pdf" title="Facture" filename="facture.pdf" onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Fermer'));
    expect(onClose).toHaveBeenCalled();
  });

  it('affiche les actions supplémentaires fournies (ex. Envoyer la facture)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['%PDF-1.4']) }) as unknown as Response));
    stubBlobUrl();
    render(
      <PdfPreviewModal
        url="/api/invoices/1/pdf" title="Facture" filename="facture.pdf" onClose={() => {}}
        extraActions={<button>Envoyer facture</button>}
      />,
    );
    await waitFor(() => expect(screen.getByText('Envoyer facture')).toBeTruthy());
  });

  describe('Imprimer', () => {
    it('passe par le partage natif (fichier) quand il est disponible — fonctionne sans code natif dans l\'app', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['%PDF-1.4']) }) as unknown as Response));
      stubBlobUrl();
      const share = vi.fn(async (_data: ShareData) => {});
      vi.stubGlobal('navigator', { ...navigator, canShare: () => true, share });

      render(<PdfPreviewModal url="/api/invoices/1/pdf" title="Facture F-1" filename="facture-F-1.pdf" onClose={() => {}} />);
      await waitFor(() => expect(screen.getByText('Imprimer')).toBeTruthy());
      fireEvent.click(screen.getByText('Imprimer'));

      await waitFor(() => expect(share).toHaveBeenCalled());
      const call = share.mock.calls[0];
      if (!call) throw new Error('share non appelé');
      const [arg] = call;
      expect(arg.files?.[0]?.name).toBe('facture-F-1.pdf');
      expect(arg.title).toBe('Facture F-1');
    });

    it('retombe sur l\'impression directe de l\'aperçu quand le partage de fichier n\'est pas supporté', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['%PDF-1.4']) }) as unknown as Response));
      stubBlobUrl();
      vi.stubGlobal('navigator', { ...navigator, canShare: undefined, share: undefined });

      render(<PdfPreviewModal url="/api/invoices/1/pdf" title="Facture" filename="facture.pdf" onClose={() => {}} />);
      await waitFor(() => expect(document.querySelector('iframe')).toBeTruthy());

      const iframe = document.querySelector('iframe') as HTMLIFrameElement;
      const print = vi.fn();
      const focus = vi.fn();
      Object.defineProperty(iframe, 'contentWindow', { value: { focus, print }, configurable: true });

      fireEvent.click(screen.getByText('Imprimer'));
      expect(focus).toHaveBeenCalled();
      expect(print).toHaveBeenCalled();
    });
  });
});
