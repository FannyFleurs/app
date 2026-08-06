// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import CategoryIcon, {
  CATEGORY_ICONS, CATEGORY_ICON_GROUPS, categoryIconDef,
} from '@/lib/category-icons';
import CategoryIconPicker from '@/components/CategoryIconPicker';

/**
 * Bibliothèque d'icônes de catégorie.
 *
 * Deux invariants gardent la collection utilisable à mesure qu'elle grossit :
 * une clé est unique (elle est stockée en base, un doublon ferait pointer deux
 * catégories sur le même dessin par accident), et chaque icône appartient à un
 * rayon déclaré — le sélecteur n'affiche QUE les rayons connus, donc une faute
 * de frappe dans un nom de groupe rendrait l'icône introuvable sans rien
 * casser de visible.
 */

afterEach(cleanup);

describe('Collection d\'icônes', () => {
  it('propose un choix substantiel, couvrant plusieurs métiers', () => {
    expect(CATEGORY_ICONS.length).toBeGreaterThanOrEqual(100);
    expect(CATEGORY_ICON_GROUPS.length).toBeGreaterThanOrEqual(10);
  });

  it('ne comporte aucune clé en double', () => {
    const keys = CATEGORY_ICONS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('rattache chaque icône à un rayon déclaré', () => {
    const known = new Set<string>(CATEGORY_ICON_GROUPS);
    const orphans = CATEGORY_ICONS.filter((i) => !known.has(i.group));
    expect(orphans.map((o) => `${o.key} → ${o.group}`)).toEqual([]);
  });

  it('donne à chaque icône un libellé et un dessin', () => {
    for (const i of CATEGORY_ICONS) {
      expect(i.label.trim().length).toBeGreaterThan(0);
      expect(i.art).toBeTruthy();
    }
  });

  it('rend un SVG pour une clé connue', () => {
    const { container } = render(<CategoryIcon name="flower" size={32} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('32');
    expect(svg?.querySelectorAll('path, circle, rect, ellipse').length).toBeGreaterThan(0);
  });

  it("n'affiche rien plutôt qu'un carré vide sur une clé inconnue", () => {
    // Cas réel : une icône retirée d'une version à l'autre, alors que des
    // catégories la référencent encore en base.
    const { container } = render(<CategoryIcon name="icone-supprimee" />);
    expect(container.querySelector('svg')).toBeNull();
    expect(categoryIconDef('icone-supprimee')).toBeNull();
    expect(categoryIconDef(null)).toBeNull();
  });
});

describe('Sélecteur d\'icône', () => {
  it('retrouve une icône par son libellé', () => {
    const onChange = vi.fn();
    render(<CategoryIconPicker value={null} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText(/Rechercher une icône/), {
      target: { value: 'tulipe' },
    });
    expect(screen.getByRole('button', { name: 'Tulipe' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cadeau' })).toBeNull();
  });

  it('retrouve une icône par un mot-clé absent de son nom', () => {
    // « Boucherie » se cherche naturellement avec « viande ».
    const onChange = vi.fn();
    render(<CategoryIconPicker value={null} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText(/Rechercher une icône/), {
      target: { value: 'viande' },
    });
    expect(screen.getByRole('button', { name: 'Boucherie' })).toBeTruthy();
  });

  it('remonte la clé choisie, et sait revenir à aucune icône', () => {
    const onChange = vi.fn();
    render(<CategoryIconPicker value="flower" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Rose' }));
    expect(onChange).toHaveBeenCalledWith('rose');

    fireEvent.click(screen.getByRole('button', { name: 'Aucune' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("signale l'icône active", () => {
    render(<CategoryIconPicker value="flower" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Fleur' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Rose' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('annonce quand rien ne correspond', () => {
    render(<CategoryIconPicker value={null} onChange={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Rechercher une icône/), {
      target: { value: 'zzzzz' },
    });
    expect(screen.getByText(/Aucune icône ne correspond/)).toBeTruthy();
  });
});
