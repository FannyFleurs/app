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
    expect(CATEGORY_ICONS.length).toBeGreaterThanOrEqual(120);
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

  it('donne à chaque icône un libellé et un composant Lucide', () => {
    for (const i of CATEGORY_ICONS) {
      expect(i.label.trim().length).toBeGreaterThan(0);
      expect(typeof i.Icon).toBe('object');
    }
  });

  it('honore les clés des anciennes icônes maison', () => {
    // Le passage à Lucide a fondu ou écarté certains dessins. Une catégorie
    // déjà paramétrée ne doit pas se retrouver sans icône pour autant : les
    // anciennes clés doivent toutes retomber sur un dessin.
    const legacy = [
      'tulip', 'bouquet', 'orchid', 'sunflower', 'dried-flower', 'fern',
      'plant', 'cactus', 'seedling', 'wreath', 'watering-can', 'gloves',
      'pot', 'cushion', 'cheese', 'honey', 'spice', 'basket-food', 'bread',
      'cupcake', 'cosmetics', 'lipstick', 'nails', 'dress', 'hat', 'aquarium',
    ];
    const orphans = legacy.filter((k) => categoryIconDef(k) === null);
    expect(orphans).toEqual([]);
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
    render(<CategoryIconPicker value={null} onChange={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Rechercher une icône/), {
      target: { value: 'coiffure' },
    });
    expect(screen.getByRole('button', { name: 'Coiffure' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cadeau' })).toBeNull();
  });

  it('retrouve une icône par un mot-clé absent de son nom', () => {
    // « Boucherie » se cherche naturellement avec « viande », et un fleuriste
    // tape « tulipe » pour trouver la fleur coupée.
    render(<CategoryIconPicker value={null} onChange={vi.fn()} />);
    const field = screen.getByPlaceholderText(/Rechercher une icône/);

    fireEvent.change(field, { target: { value: 'viande' } });
    expect(screen.getByRole('button', { name: 'Boucherie' })).toBeTruthy();

    fireEvent.change(field, { target: { value: 'tulipe' } });
    expect(screen.getByRole('button', { name: 'Fleur coupée' })).toBeTruthy();
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

  it("surligne le dessin réellement affiché pour une clé héritée", () => {
    // « bouquet » n'existe plus comme entrée propre : il pointe vers la fleur
    // coupée. Sans quoi le libellé annoncerait une icône que rien ne montre.
    render(<CategoryIconPicker value="bouquet" onChange={() => {}} />);
    expect(screen.getByText('Fleur coupée', { selector: 'span' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Fleur coupée' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('annonce quand rien ne correspond', () => {
    render(<CategoryIconPicker value={null} onChange={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Rechercher une icône/), {
      target: { value: 'zzzzz' },
    });
    expect(screen.getByText(/Aucune icône ne correspond/)).toBeTruthy();
  });
});
