/**
 * tests/unit/f-acc-330-xaf-concept-marker.test.js
 *
 * RATEL (F-ACC-330, accountant-as): de XAF 4.0 nam Concept-boekingen (HITL: nog
 * niet door de klant bevestigd) ongemarkeerd mee in <transactions>, naast
 * Gevalideerde regels. Een accountant die de auditfile importeert nam alles als
 * definitief over. Fix: Concept-rijen krijgen een [CONCEPT]-prefix in <desc>
 * (XSD-veilig, gecapt op 50). Deze test borgt dat de markering aanwezig is voor
 * Concept en afwezig voor committed.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'RgsMapping.gs', 'XafExport.gs', 'XafExport40.gs']);

function jpRow(id, omschr, status) {
  const r = new Array(17).fill('');
  r[0] = id; r[1] = new Date(2026, 0, 15); r[2] = omschr; r[3] = 'Verkoopdagboek';
  r[4] = '1300'; r[6] = '8000'; r[8] = 100; r[16] = status || '';
  return r;
}

describe('F-ACC-330 — XAF markeert Concept-boekingen als niet-gevalideerd', () => {
  const header = new Array(17).fill('').map((_, i) => 'K' + i);
  const jpData = [header, jpRow('B1', 'Verkoop committed', ''), jpRow('B2', 'Verkoop concept', 'Concept')];
  const xml = ctx._xaf40Transactions_(null, 2026, jpData);

  test('Concept-rij krijgt [CONCEPT] in de transactie-desc', () => {
    expect(xml).toMatch(/<desc>\[CONCEPT\] Verkoop concept<\/desc>/);
  });

  test('committed rij blijft ongemarkeerd', () => {
    expect(xml).toMatch(/<desc>Verkoop committed<\/desc>/);
    expect(xml).not.toMatch(/\[CONCEPT\] Verkoop committed/);
  });

  test('beide boekingen zitten nog in de auditfile (Concept wordt niet weggefilterd)', () => {
    expect((xml.match(/<transaction>/g) || []).length).toBe(2);
  });
});
