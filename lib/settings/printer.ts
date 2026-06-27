/**
 * Configuration de l'imprimante ticket (réseau IP, ESC/POS).
 *
 * Stockée dans la table settings sous la clé `printer`.
 * Limites : depuis un navigateur, on ne peut pas envoyer directement
 * des octets ESC/POS sur un port TCP arbitraire (sécurité). Cette
 * config est exploitée par :
 *   - les imprimantes AirPrint déclarées au niveau OS (iPad / Mac) :
 *     la config sert juste à mémoriser le modèle + largeur papier
 *   - un futur pont local (script Node ou app compagnon) qui lira la
 *     config et relayera les jobs depuis le navigateur
 */

export interface PrinterSettings {
  enabled: boolean;
  ip: string;
  port: number;
  paper_width: 58 | 80;
  brand: string;          // ex : "Epson TM-T20III"
  auto_print: boolean;    // imprimer automatiquement le ticket après vente
}

export const PRINTER_KEY = 'printer';

export const PRINTER_DEFAULTS: PrinterSettings = {
  enabled: false,
  ip: '',
  port: 9100,
  paper_width: 80,
  brand: '',
  auto_print: false,
};

export function mergePrinterDefaults(partial: Partial<PrinterSettings> | null): PrinterSettings {
  return { ...PRINTER_DEFAULTS, ...(partial ?? {}) };
}
