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

  test('F-RED-332 (3e ronde): prijs ≤€0,01 ZONDER vervalmoment → stempelt de 24u-klok (élk pad, ook de prijs-knop)', () => {
    const props = maakProps({ PRODUCT_PRIJS: '0.01' }); // gezet via bv. adminZetPrijs, geen TTL
    const voor = Date.now();
    expect(herstelVerlopenTestModus(props)).toBe(false);  // nog niet hersteld, wel gestempeld
    const stamp = parseInt(props.getProperty('TEST_MODUS_VERLOOPT'), 10);
    expect(stamp).toBeGreaterThanOrEqual(voor + 23 * 3600 * 1000);
    expect(props.getProperty('PRODUCT_PRIJS')).toBe('0.01'); // prijs nog test, klok loopt nu
  });
});

describe('F-RED-331 — wiring (de auto-revert is op de juiste plekken ingehaakt)', () => {
  test('de chokepoint _zetTestModusPreset_ zet TEST_MODUS_VERLOOPT (AAN) en wist het (UIT)', () => {
    const fn = functieBron('_zetTestModusPreset_');
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

  // CONTRACT (2e ronde) — sluit de parallel-pad-drift-klasse: de red-team vond
  // dat het dashboard-pad adminZetTestModus de €0,01-preset zette zónder
  // TEST_MODUS_VERLOOPT → auto-revert inert. Élke functie (Code.gs +
  // AdminDashboard.gs) die PRODUCT_PRIJS op '0.01' zet MOET via de chokepoint
  // _zetTestModusPreset_ lopen. Een nieuwe toggle die het overslaat faalt CI.
  test('CONTRACT: elke €0,01-test-modus-toggle loopt via _zetTestModusPreset_', () => {
    const LS = path.resolve(__dirname, '../../licence-server');
    const bestanden = ['Code.gs', 'AdminDashboard.gs'];
    const overtreders = [];
    bestanden.forEach((f) => {
      const txt = fs.readFileSync(path.join(LS, f), 'utf8');
      const fnRe = /function\s+(\w+)\s*\([^)]*\)\s*\{/g;
      const starts = [];
      let m;
      while ((m = fnRe.exec(txt)) !== null) starts.push({ naam: m[1], i: m.index });
      starts.forEach((s, idx) => {
        const eind = idx + 1 < starts.length ? starts[idx + 1].i : txt.length;
        const body = txt.slice(s.i, eind);
        if (s.naam === '_zetTestModusPreset_') return; // de chokepoint zelf
        if (/setProperty\(\s*'PRODUCT_PRIJS'\s*,\s*'0\.01'\s*\)/.test(body)) {
          if (body.indexOf('_zetTestModusPreset_(') < 0) overtreders.push(f + ':' + s.naam);
        }
      });
    });
    expect(overtreders).toEqual([]); // leeg = geen toggle die de chokepoint omzeilt
  });
});
