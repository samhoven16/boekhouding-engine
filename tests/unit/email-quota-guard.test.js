/**
 * tests/unit/email-quota-guard.test.js
 *
 * EmailQuotaGuard.gs — bewaakt klant's eigen Gmail-quota om "stille
 * blokkade" van facturen te voorkomen.
 *
 * Aanpak: bron-inspectie + functionele simulatie van de niveau-mapping
 * en idempotency. Geen koppeling aan GmailApp (real-world side-effect).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../src');
const bron = fs.readFileSync(path.join(SRC, 'EmailQuotaGuard.gs'), 'utf8');

describe('EmailQuotaGuard.gs — bron-hygiëne', () => {
  test('Drie publieke helpers + niveau-constanten aanwezig', () => {
    expect(bron).toMatch(/function getEmailQuotaStatus_/);
    expect(bron).toMatch(/function controleerEmailQuotaProactief_/);
    expect(bron).toMatch(/function mogelijkVerzenden_/);
  });

  test('Geen Brevo / SendInBlue executable dependency (forward-protection)', () => {
    // Klant gebruikt eigen Gmail; we introduceren GEEN externe mailprovider.
    // Doc-comments mogen die termen wel noemen (uitleg waarom we ze niet
    // gebruiken). Alleen statements zijn verboden.
    const zonderComments = bron
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(zonderComments).not.toMatch(/brevo/i);
    expect(zonderComments).not.toMatch(/sendinblue/i);
    expect(zonderComments).not.toMatch(/sendgrid/i);
  });

  test('Idempotency: max 1 waarschuwing per dag per niveau-escalatie', () => {
    expect(bron).toMatch(/_EMAIL_QUOTA_WAARSCHUWING_PROP/);
    expect(bron).toMatch(/yyyy-MM-dd/);
    // Sleutel = datum + niveau, dus escalatie WAARSCHUWING → KRITIEK
    // krijgt nog een tweede mail (verwacht gedrag)
    expect(bron).toMatch(/vandaag \+ ['"]:['"] \+ status\.niveau/);
  });

  test('Default dag-cap = 100 (consumer Gmail)', () => {
    expect(bron).toMatch(/_EMAIL_QUOTA_DAGCAP_DEFAULT\s*=\s*100/);
  });

  test('Workspace-cap (1500/dag) wordt herkend via dynamische totaal-berekening', () => {
    expect(bron).toMatch(/Math\.max\(_EMAIL_QUOTA_DAGCAP_DEFAULT, resterend\)/);
  });

  test('Bij niet-bereikbare quota-API: graceful pass-through (geen blokkade)', () => {
    expect(bron).toMatch(/if \(!status\.bereikbaar\) return true/);
  });

  test('Wiring: dagelijkseTaken roept controleerEmailQuotaProactief_ aan', () => {
    const triggers = fs.readFileSync(path.join(SRC, 'Triggers.gs'), 'utf8');
    expect(triggers).toMatch(/_runTaak_\(['"]emailQuotaWaarschuwing['"]/);
    expect(triggers).toMatch(/controleerEmailQuotaProactief_/);
  });
});

// Functionele simulatie van de niveau-mapping. Deze logic moet pijnlijk
// expliciet zijn — een verkeerde grens betekent ofwel false-alarms (klant
// geërgerd) of gemiste waarschuwingen (factuur landt in DLQ).
describe('Niveau-mapping bij quota-percentages', () => {
  function bepaalNiveau(resterend, totaal) {
    if (!isFinite(resterend) || resterend < 0) resterend = 0;
    totaal = Math.max(100, totaal);
    const gebruikt = totaal - resterend;
    const percentGebruikt = totaal > 0 ? (gebruikt / totaal) * 100 : 100;
    if (resterend === 0) return 'OP';
    if (percentGebruikt >= 95) return 'KRITIEK';
    if (percentGebruikt >= 80) return 'WAARSCHUWING';
    if (percentGebruikt >= 60) return 'LET_OP';
    return 'OK';
  }

  test('100% vrij → OK', () => {
    expect(bepaalNiveau(100, 100)).toBe('OK');
  });
  test('50% vrij (= 50% gebruikt) → OK', () => {
    expect(bepaalNiveau(50, 100)).toBe('OK');
  });
  test('Net onder LET_OP-drempel (59% gebruikt) → OK', () => {
    expect(bepaalNiveau(41, 100)).toBe('OK');
  });
  test('Op LET_OP-drempel (60% gebruikt) → LET_OP', () => {
    expect(bepaalNiveau(40, 100)).toBe('LET_OP');
  });
  test('Op WAARSCHUWING-drempel (80% gebruikt) → WAARSCHUWING', () => {
    expect(bepaalNiveau(20, 100)).toBe('WAARSCHUWING');
  });
  test('Op KRITIEK-drempel (95% gebruikt) → KRITIEK', () => {
    expect(bepaalNiveau(5, 100)).toBe('KRITIEK');
  });
  test('1 over → KRITIEK (≥95% gebruikt)', () => {
    expect(bepaalNiveau(1, 100)).toBe('KRITIEK');
  });
  test('0 over → OP', () => {
    expect(bepaalNiveau(0, 100)).toBe('OP');
  });
  test('Workspace 1500: 1499 over (0.07% gebruikt) → OK', () => {
    expect(bepaalNiveau(1499, 1500)).toBe('OK');
  });
  test('Workspace 1500: 200 over (87% gebruikt) → WAARSCHUWING', () => {
    expect(bepaalNiveau(200, 1500)).toBe('WAARSCHUWING');
  });
});

describe('mogelijkVerzenden_ — prioriteit-respect', () => {
  function mogelijk(niveau, prioriteit) {
    // Repliceert exact de logic uit src/EmailQuotaGuard.gs
    const bereikbaar = true;
    if (!bereikbaar) return true;
    if (niveau === 'OP') return false;
    if (niveau === 'KRITIEK') return prioriteit === 'CRITIEK';
    return true;
  }

  test('OK + NORMAAL → mag', () => {
    expect(mogelijk('OK', 'NORMAAL')).toBe(true);
  });
  test('WAARSCHUWING + LAAG → mag (we waarschuwen alleen)', () => {
    expect(mogelijk('WAARSCHUWING', 'LAAG')).toBe(true);
  });
  test('KRITIEK + CRITIEK (factuur) → mag', () => {
    expect(mogelijk('KRITIEK', 'CRITIEK')).toBe(true);
  });
  test('KRITIEK + NORMAAL → mag NIET (reserveer voor facturen)', () => {
    expect(mogelijk('KRITIEK', 'NORMAAL')).toBe(false);
  });
  test('KRITIEK + LAAG → mag NIET', () => {
    expect(mogelijk('KRITIEK', 'LAAG')).toBe(false);
  });
  test('OP + CRITIEK → mag NIET (echt op)', () => {
    expect(mogelijk('OP', 'CRITIEK')).toBe(false);
  });
});
