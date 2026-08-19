import { describe, it, expect } from 'vitest';
import {
  ipPrinterKey,
  mergeIpPrinterDefaults,
  IP_PRINTER_DEFAULTS,
} from '@/lib/settings/ip-printer';

describe('ipPrinterKey', () => {
  it('portée organisation sans boutique', () => {
    expect(ipPrinterKey()).toBe('ip_printer');
    expect(ipPrinterKey(null)).toBe('ip_printer');
  });
  it('portée boutique', () => {
    expect(ipPrinterKey('abc')).toBe('ip_printer:abc');
  });
});

describe('mergeIpPrinterDefaults', () => {
  it('null -> défauts (désactivée)', () => {
    expect(mergeIpPrinterDefaults(null)).toEqual(IP_PRINTER_DEFAULTS);
  });

  it('nettoie et borne les valeurs', () => {
    expect(mergeIpPrinterDefaults({ enabled: true, host: '  192.168.1.50 ', port: 9100, width_dots: 384 }))
      .toEqual({ enabled: true, host: '192.168.1.50', port: 9100, width_dots: 384 });
  });

  it('port invalide -> 9100', () => {
    expect(mergeIpPrinterDefaults({ port: 0 }).port).toBe(9100);
    expect(mergeIpPrinterDefaults({ port: 70000 }).port).toBe(9100);
    expect(mergeIpPrinterDefaults({ port: 631 }).port).toBe(631);
  });

  it('largeur restreinte à 576 ou 384', () => {
    expect(mergeIpPrinterDefaults({ width_dots: 576 }).width_dots).toBe(576);
    expect(mergeIpPrinterDefaults({ width_dots: 384 }).width_dots).toBe(384);
    expect(mergeIpPrinterDefaults({ width_dots: 999 }).width_dots).toBe(576);
  });

  it('enabled n’est vrai que pour true strict', () => {
    expect(mergeIpPrinterDefaults({ enabled: undefined }).enabled).toBe(false);
    expect(mergeIpPrinterDefaults({}).enabled).toBe(false);
    expect(mergeIpPrinterDefaults({ enabled: true }).enabled).toBe(true);
  });
});
