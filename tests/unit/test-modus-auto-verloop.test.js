/**
 * tests/unit/test-modus-auto-verloop.test.js
 *
 * RATEL — F-RED-331. Test-modus zet PRODUCT_PRIJS=0.01 ("koop voor 1 cent").
 * Vergeet Sam 'm uit te zetten, dan lekt elke verkoop omzet. De fix: test-modus
 * verloopt automatisch na 24u (TEST_MODUS_VERLOOPT) en wordt op elke doGet én
 * vóór elke betaling hersteld. Deze test faalt zónder die auto-revert.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const CODE_GS = path.resolve(__dirname, '../../licence-server/Code.gs');
const src = fs.readFileSync(CODE_GS, 'utf8');

function functieBron(naam) {
  const start = src.indexOf('function ' + naam);
  if (start < 0) throw new Error('functie niet gevonden: ' + naam);
  const na = src.indexOf('\nfunction ', start + 1);
  return src.slice(start, na < 0 ? src.length : na);
}

function maakProps(init) {
  const store = Object.assign({}, init);
  return {
    getProperty: (k) => (k in store ? store[k] : null),
    setProperty: (k, v) => { store[k] = String(v); },
    deleteProperty: (k) => { delete store[k]; },
    _store: store,
  };
}

// Laad _herstelVerlopenTestModus_ geïsoleerd met een gemockte schrijfAuditLog_.
const auditLog = [];
const herstelVerlopenTestModus = new Function(
  'schrijfAuditLog_',
  functieBron('_herstelVerlopenTestModus_') + '\nreturn _herstelVerlopenTestModus_;'
)((a, b) => auditLog.push([a, b]));

describe('F-RED-331 — test-modus verloopt automatisch', () => {
  test('VERLOPEN stand → herstelt live-prijs, wist REF_KORTING + TEST_MODUS_VERLOOPT', () => {
    const props = maakProps({
      PRODUCT_PRIJS: '0.01',
      REF_KORTING: '0',
      TEST_MODUS_VERLOOPT: String(Date.now() - 1000), // 1s geleden verlopen
    });
    const hersteld = herstelVerlopenTestModus(props);
    expect(hersteld).toBe(true);
    expect(props.getProperty('PRODUCT_PRIJS')).toBe('49.00');
    expect(props.getProperty('REF_KORTING')).toBeNull();
    expect(props.getProperty('TEST_MODUS_VERLOOPT')).toBeNull();
  });

  test('GELDIGE stand (nog binnen 24u) → ongemoeid', () => {
    const props = maakProps({
      PRODUCT_PRIJS: '0.01',
      REF_KORTING: '0',
      TEST_MODUS_VERLOOPT: String(Date.now() + 3600 * 1000), // over 1u
    });
    const hersteld = herstelVerlopenTestModus(props);
    expect(hersteld).toBe(false);
    expect(props.getProperty('PRODUCT_PRIJS')).toBe('0.01'); // nog test-modus
  });

  test('GEEN test-modus (geen TEST_MODUS_VERLOOPT) → no-op', () => {
    const props = maakProps({ PRODUCT_PRIJS: '49.00' });
    expect(herstelVerlopenTestModus(props)).toBe(false);
    expect(props.getProperty('PRODUCT_PRIJS')).toBe('49.00');
  });
});

describe('F-RED-331 — wiring (de auto-revert is op de juiste plekken ingehaakt)', () => {
  test('test-modus AAN zet TEST_MODUS_VERLOOPT; UIT wist het', () => {
    const fn = functieBron('adminTestModusEndpoint_');
    expect(fn).toMatch(/setProperty\(\s*'TEST_MODUS_VERLOOPT'/);
    expect(fn).toMatch(/deleteProperty\(\s*'TEST_MODUS_VERLOOPT'\s*\)/);
  });

  test('zelfHerstelProductConfig_ ÉN maakBetaling roepen _herstelVerlopenTestModus_ aan', () => {
    expect(functieBron('zelfHerstelProductConfig_')).toContain('_herstelVerlopenTestModus_(');
    expect(functieBron('maakBetaling')).toContain('_herstelVerlopenTestModus_(');
  });

  test('admin-paneel toont een banner zolang de prijs <= 0.01 is', () => {
    const fn = functieBron('adminPaneel_');
    expect(fn).toMatch(/prijsNu\s*<=\s*0\.01/);
    expect(fn).toContain('TEST-MODUS ACTIEF');
  });
});
