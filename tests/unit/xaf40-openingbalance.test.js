/**
 * tests/unit/xaf40-openingbalance.test.js
 *
 * RATEL (F-ACC-161, accountant/Belastingdienst): XAF 4.0 emitte nooit
 * <openingBalance> → een auditfile van jaar-2+ stond niet op zichzelf; de
 * balansrekeningen waren niet uit één bestand te reconstrueren (art. 52 AWR
 * volledigheid + RJ 160/170 continuïteit).
 *
 * _xaf40OpeningBalance_ reconstrueert het 1-1-saldo uit het continue journaal:
 * netto van álle niet-CORRUPT boekingen vóór 1-1-jaar. Balansrekeningen dragen
 * hun cumulatieve saldo; een correct afgesloten W&V-rekening nettet naar 0 en
 * valt weg. Invariant: Σdebet == Σcredit (elke bron-boeking is gebalanceerd) en
 * openingsbalans + transacties(jaar) = het huidige grootboeksaldo.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const XSD = path.resolve(__dirname, '../../docs/xaf/XmlAuditfileFinancieel4.0.xsd');
const HEEFT_XMLLINT = (() => {
  try { execSync('xmllint --version', { stdio: 'pipe' }); return true; } catch (_) { return false; }
})();

function maakCtx() {
  const ctx = createGasRuntime([
    'Config.gs', 'Utils.gs', 'Belastingadvies.gs', 'Invariants.gs',
    'RgsMapping.gs', 'XafExport.gs', 'XafExport40.gs',
  ]);
  ctx.getInstelling_ = (k) => {
    if (k === 'Bedrijfsnaam') return 'Test BV';
    if (k === 'KvK-nummer') return '12345678';
    if (k === 'BTW-nummer') return 'NL004384587B39';
    return '';
  };
  ctx.Utilities = {
    formatDate: (d, tz, fmt) => {
      if (!(d instanceof Date)) return '';
      if (fmt === 'yyyy-MM-dd') return d.toISOString().slice(0, 10);
      return d.toISOString();
    },
  };
  return ctx;
}

const GB = [
  ['Code', 'Naam', 'c2', 'c3', 'Balans/W&V'],
  ['1100', 'Debiteuren/Bank', '', '', 'Balans'],
  ['2000', 'Eigen vermogen', '', '', 'Balans'],
  ['2500', 'Resultaat boekjaar', '', '', 'Balans'],
  ['7000', 'Kosten', '', '', 'W&V'],
  ['8000', 'Omzet', '', '', 'W&V'],
];
const JP_H = ['ID', 'Datum', 'Omschr', 'Dagboek', 'Debet', 'DNaam', 'Credit', 'CNaam', 'Bedrag', 'BTW%', 'BTWBedrag'];

function ssMet(journaal) {
  const sheets = { Grootboekschema: GB, Journaalposten: [JP_H].concat(journaal), Relaties: [['Relatie ID', 'Type', 'Naam']] };
  return { getSheetByName: (n) => (sheets[n] ? { getDataRange: () => ({ getValues: () => sheets[n] }) } : null) };
}
function obBlok(xaf) {
  const m = xaf.match(/<openingBalance>[\s\S]*?<\/openingBalance>/);
  return m ? m[0] : '';
}

describe('XAF 4.0 — openingsbalans (F-ACC-161)', () => {
  // 2023-historie + één 2024-transactie; export 2024.
  const journaal2023 = [
    ['JPa', new Date(2023, 1, 1), 'Kapitaalstorting', 'Memoriaal', '1100', 'Bank', '2000', 'EV', 5000.00, '', 0],
    ['JPb', new Date(2023, 3, 10), 'Verkoop', 'Verkoopboek', '1100', 'Bank', '8000', 'Omzet', 1000.00, '', 0],
    ['JPc', new Date(2023, 11, 31), 'Resultaatverwerking', 'Memoriaal', '8000', 'Omzet', '2500', 'Resultaat', 1000.00, '', 0],
    ['JPd', new Date(2024, 2, 5), 'Kosten 2024', 'Inkoopboek', '7000', 'Kosten', '1100', 'Bank', 500.00, '', 0],
  ];

  let xaf;
  beforeAll(() => { xaf = maakCtx()._bouwXaf40Xml_(ssMet(journaal2023), 2024); });

  test('emit <openingBalance> met de balansrekeningen 1-1-2024', () => {
    const ob = obBlok(xaf);
    expect(ob).not.toBe('');
    // 1100 = +5000 +1000 (debet) → D 6000,00
    expect(ob).toMatch(/<accID>1100<\/accID>\s*<amnt>6000\.00<\/amnt>\s*<amntTp>D<\/amntTp>/);
    // 2000 = −5000 (credit) → C 5000,00
    expect(ob).toMatch(/<accID>2000<\/accID>\s*<amnt>5000\.00<\/amnt>\s*<amntTp>C<\/amntTp>/);
    // 2500 = −1000 (resultaat, nog niet doorgeboekt naar 2600) → C 1000,00
    expect(ob).toMatch(/<accID>2500<\/accID>\s*<amnt>1000\.00<\/amnt>\s*<amntTp>C<\/amntTp>/);
  });

  test('correct afgesloten W&V-rekening (8000) nettet naar 0 → NIET in de openingsbalans', () => {
    const ob = obBlok(xaf);
    expect(ob).not.toMatch(/<accID>8000<\/accID>/);
    expect(ob).not.toMatch(/<accID>7000<\/accID>/);  // 7000 pas in 2024 geboekt
  });

  test('openingsbalans is in balans: linesCount 3 + totalDebit == totalCredit', () => {
    const ob = obBlok(xaf);
    expect(ob).toMatch(/<linesCount>3<\/linesCount>/);
    expect(ob).toMatch(/<totalDebit>6000\.00<\/totalDebit>/);
    expect(ob).toMatch(/<totalCredit>6000\.00<\/totalCredit>/);
  });

  test('reconciliatie: 2024-transactie (JPd) zit in <transactions>, niet in de opening', () => {
    expect(obBlok(xaf)).not.toMatch(/JPd/);
    expect(xaf).toMatch(/<transactions>[\s\S]*JPd[\s\S]*<\/transactions>/);
  });

  test('valideert tegen de officiële XSD (xmllint)', () => {
    if (!HEEFT_XMLLINT) { console.warn('[xaf40-ob] xmllint niet beschikbaar — overgeslagen.'); return; }
    const tmp = path.join(os.tmpdir(), 'xaf40ob-' + Date.now() + '.xaf');
    fs.writeFileSync(tmp, xaf, 'utf8');
    let fout = '';
    try { execSync('xmllint --noout --schema "' + XSD + '" "' + tmp + '"', { stdio: 'pipe' }); }
    catch (e) { fout = (e.stderr ? e.stderr.toString() : '') + (e.stdout ? e.stdout.toString() : ''); }
    finally { try { fs.unlinkSync(tmp); } catch (_) { /* noop */ } }
    if (fout) throw new Error('xmllint-validatie faalde:\n' + fout + '\n\n--- output ---\n' + xaf);
    expect(fout).toBe('');
  });

  test('jaar zónder historie (export 2023) → géén <openingBalance>-blok', () => {
    const xaf2023 = maakCtx()._bouwXaf40Xml_(ssMet(journaal2023), 2023);
    expect(obBlok(xaf2023)).toBe('');
  });
});
