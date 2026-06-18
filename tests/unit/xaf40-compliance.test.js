/**
 * tests/unit/xaf40-compliance.test.js
 *
 * XAF 4.0 (verplicht per 1-1-2026). De ECHTE guard: genereer de export uit
 * `_bouwXaf40Xml_` en valideer 'm met `xmllint` tegen de OFFICIËLE XSD van de
 * Belastingdienst-ODB (docs/xaf/XmlAuditfileFinancieel4.0.xsd). Geen
 * string-gokwerk — schema-validatie is de waarheid.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const XSD = path.resolve(__dirname, '../../docs/xaf/XmlAuditfileFinancieel4.0.xsd');

// xmllint is de schema-validator. Beschikbaar lokaal + op GitHub-ubuntu-runners
// (libxml2-utils). Mocht een omgeving 'm missen, dan slaan we de schema-check
// over i.p.v. te falen op een ontbrekende binary — de structurele checks blijven.
const HEEFT_XMLLINT = (() => {
  try { execSync('xmllint --version', { stdio: 'pipe' }); return true; } catch (_) { return false; }
})();

describe('XAF 4.0 — valideert tegen de officiële XSD', () => {
  let xaf;

  beforeAll(() => {
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

    // Grootboek met expliciete Balans/W&V-kolom [4] + BTW-rekeningen.
    const grootboek = [
      ['Code', 'Naam', 'c2', 'c3', 'Balans/W&V'],
      ['1100', 'Debiteuren', '', '', 'Balans'],
      ['1410', 'Te vorderen BTW 21%', '', '', 'Balans'],
      ['4110', 'BTW af te dragen 21%', '', '', 'Balans'],
      ['4000', 'Crediteuren', '', '', 'Balans'],
      ['8000', 'Omzet 21%', '', '', 'W&V'],
      ['7000', 'Inkoopwaarde', '', '', 'W&V'],
    ];
    // Verkoopfactuur = 2 rijen (omzet + BTW als aparte grootboekmutatie), inkoop
    // = 1 rij. JP004 = Concept: telt mee in het grootboeksaldo/rapporten, dus
    // MOET in de export (anders sluit de schermbalans niet aan op de auditfile).
    // JP099 = CORRUPT: saldo al teruggedraaid via atomic rollback, dus MOET eruit.
    // Beide 17 kolommen, status op index 16.
    const journaal = [
      ['ID', 'Datum', 'Omschr', 'Dagboek', 'Debet', 'DNaam', 'Credit', 'CNaam', 'Bedrag', 'BTW%', 'BTWBedrag'],
      ['JP001', new Date(2024, 0, 15), 'Verkoop 001', 'Verkoopboek', '1100', 'Debiteuren', '8000', 'Omzet', 100.00, '21%', 0],
      ['JP002', new Date(2024, 0, 15), 'Verkoop 001 (BTW)', 'Verkoopboek', '1100', 'Debiteuren', '4110', 'BTW af te dragen', 21.00, '21%', 21.00],
      ['JP003', new Date(2024, 2, 20), 'Inkoop materiaal', 'Inkoopboek', '7000', 'Inkoopwaarde', '4000', 'Crediteuren', 50.00, '21%', 0],
      ['JP004', new Date(2024, 4, 10), 'Memoriaal (concept)', 'Memoriaal', '1100', 'Debiteuren', '8000', 'Omzet', 30.00, '0%', 0, '', '', '', '', '', 'Concept'],
      ['JP099', new Date(2024, 3, 1), 'CORRUPT half-geboekt', 'Verkoopboek', '1100', 'Debiteuren', '8000', 'Omzet', 999.00, '21%', 0, '', '', '', '', '', 'CORRUPT'],
    ];
    const relaties = [
      ['Relatie ID', 'Type', 'Naam', 'Contact', 'Adres', 'Postcode', 'Plaats', 'Land', 'KvK', 'BTW', 'Email'],
      ['REL0001', 'Klant', 'Klant A', '', '', '', '', 'NL', '87654321', 'NL123456789B01', 'a@klant.nl'],
      ['REL0002', 'Leverancier', 'Lev B', '', '', '', '', 'NL', '11223344', 'NL987654321B02', 'b@lev.nl'],
    ];

    const mockSheets = { Grootboekschema: grootboek, Journaalposten: journaal, Relaties: relaties };
    const mockSs = {
      getSheetByName: (n) => (mockSheets[n] ? { getDataRange: () => ({ getValues: () => mockSheets[n] }) } : null),
    };
    ctx.Utilities = {
      formatDate: (d, tz, fmt) => {
        if (!(d instanceof Date)) return '';
        if (fmt === 'yyyy-MM-dd') return d.toISOString().slice(0, 10);
        return d.toISOString();
      },
    };

    xaf = ctx._bouwXaf40Xml_(mockSs, 2024);
  });

  test('output valideert tegen de officiële XmlAuditfileFinancieel4.0.xsd (xmllint)', () => {
    if (!HEEFT_XMLLINT) {
      console.warn('[xaf40] xmllint niet beschikbaar — schema-validatie overgeslagen.');
      return;
    }
    const tmp = path.join(os.tmpdir(), 'xaf40-' + Date.now() + '.xaf');
    fs.writeFileSync(tmp, xaf, 'utf8');
    let fout = '';
    try {
      execSync('xmllint --noout --schema "' + XSD + '" "' + tmp + '"', { stdio: 'pipe' });
    } catch (e) {
      fout = (e.stderr ? e.stderr.toString() : '') + (e.stdout ? e.stdout.toString() : '');
    } finally {
      try { fs.unlinkSync(tmp); } catch (_) { /* noop */ }
    }
    if (fout) throw new Error('xmllint-validatie faalde:\n' + fout + '\n\n--- output ---\n' + xaf);
    expect(fout).toBe('');
  });

  test('namespace + RGS + controletotalen + export=grootboek (Concept in, CORRUPT uit) + géén vat + géén valse RGSVersion', () => {
    expect(xaf).toContain('xmlns="http://www.odb.belastingdienst.nl/Belastingdienst/BCPP/1.1/structures/XmlauditfileXAF_4.0"');
    expect(xaf).toContain('<RGScode>');
    expect(xaf).toMatch(/<linesCount>8<\/linesCount>/);          // JP001-004 = 4 rijen × 2 regels
    expect(xaf).toMatch(/<totalDebit>201\.00<\/totalDebit>/);    // 100 + 21 + 50 + 30
    expect(xaf).toMatch(/<totalCredit>201\.00<\/totalCredit>/);
    expect(xaf).toContain('<nr>JP004</nr>');                     // C-1: Concept telt mee (zit ook in het saldo/rapport)
    expect(xaf).not.toContain('JP099');                          // CORRUPT eruit (saldo al teruggedraaid)
    expect(xaf).not.toContain('<vat>');                          // BTW zit in het grootboek, niet als los blok
    expect(xaf).not.toContain('<RGSVersion>');                   // X-1: geen onbestaande "RGS 3.5"-claim
  });
});
