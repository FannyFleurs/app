import { describe, it, expect } from 'vitest';
import {
  availableFormats, enabledOptionalFormats, CORE_FORMAT, OPTIONAL_FORMATS,
} from '@/lib/settings/export-formats';

/**
 * Formats proposés à l'export.
 *
 * Cinq formats côte à côte obligeaient à choisir entre des fichiers dont on
 * ignorait le contenu. Il n'en reste qu'un par défaut — celui que saisit le
 * comptable ; les autres s'activent dans les paramètres.
 */

describe('Formats disponibles', () => {
  it('ne propose que la ventilation par compte par défaut', () => {
    // Aucun réglage enregistré : c'est l'état de toutes les organisations
    // existantes, elles ne doivent pas hériter des quatre autres formats.
    for (const rien of [null, undefined, {}, { optional: [] }]) {
      expect(availableFormats(rien).map((f) => f.value)).toEqual([CORE_FORMAT.value]);
    }
  });

  it('propose l\'Excel par défaut, garde le CSV en réserve', () => {
    // Le format montré d'emblée est l'Excel « Ventes par compte » : c'est le
    // fichier voulu au quotidien. Le CSV de la même ventilation n'est pas
    // supprimé — il reste activable dans les paramètres.
    expect(CORE_FORMAT.value).toBe('accounts_xlsx');
    expect(OPTIONAL_FORMATS.map((f) => f.value)).toContain('accounts_csv');
  });

  it('ajoute ceux qui ont été activés, sans jamais retirer le format de base', () => {
    const on = availableFormats({ optional: ['fec_like', 'sales_csv'] });
    expect(on[0]!.value).toBe(CORE_FORMAT.value);
    expect(on.map((f) => f.value)).toContain('fec_like');
    expect(on.map((f) => f.value)).toContain('sales_csv');
    expect(on).toHaveLength(3);
  });

  it('conserve l\'ordre d\'affichage, pas l\'ordre d\'activation', () => {
    const ordre = availableFormats({ optional: ['json', 'sales_csv'] }).map((f) => f.value);
    expect(ordre).toEqual([CORE_FORMAT.value, 'sales_csv', 'json']);
  });

  it('ignore une valeur inconnue plutôt que de la propager', () => {
    // Un format retiré du produit ne doit pas ressusciter par un vieux réglage.
    expect(enabledOptionalFormats({ optional: ['xml_2009', 'json'] })).toEqual(['json']);
    expect(enabledOptionalFormats({ optional: 'json' })).toEqual([]);
    expect(enabledOptionalFormats(null)).toEqual([]);
  });

  it('énonce une réserve pour les formats approximatifs', () => {
    // Écritures et FEC-like mettent toute la TVA à 20 % et ignorent certains
    // règlements : cela doit se lire avant de cocher, pas dans le fichier.
    const avecReserve = OPTIONAL_FORMATS.filter((f) => f.caveat).map((f) => f.value);
    expect(avecReserve).toEqual(['entries_csv', 'fec_like']);
  });
});
