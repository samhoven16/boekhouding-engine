/**
 * Koppelt docs/fiscale-bronnen-2026.json aan de code (les 3: documentatie die
 * code beschrijft is door een test gekoppeld) en bewijst dat de bronnencheck
 * een gewijzigde bron ook echt afkeurt (les 4).
 * Het ophalen van de pagina's zelf: npm run fiscaal:bronnen (heeft internet nodig).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');
const { platteTekst, citaatStaatErin } = require('../../scripts/fiscaal-bronnen-check');

const reg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'fiscale-bronnen-2026.json'), 'utf8'));

function vasteJaarDate(jaar) {
  const RealDate = Date;
  function FakeDate(...args) {
    const d = args.length ? new RealDate(...args) : new RealDate();
    d.getFullYear = () => jaar;
    return d;
  }
  FakeDate.now = RealDate.now; FakeDate.UTC = RealDate.UTC; FakeDate.parse = RealDate.parse;
  return FakeDate;
}
const B = createGasRuntime(['Config.gs', 'Utils.gs', 'Belastingadvies.gs'], { Date: vasteJaarDate(reg.jaar) }).getBelasting_();
const lees = (sleutel) => sleutel.split('.').reduce((o, k) => o[k], B);

describe('fiscaal bronnenregister ↔ Belastingadvies.gs', () => {
  test('register is niet leeg en heeft een verloopdatum', () => {
    expect(reg.bronnen.length).toBeGreaterThan(10);
    expect(reg.geldigTot).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  reg.bronnen.forEach((b) => {
    b.constanten.forEach((c) => {
      test(`${b.id}: ${c.sleutel} = ${c.waarde} en "${c.staatAls}" staat in het citaat`, () => {
        expect(b.citaat).toContain(c.staatAls);
        expect(lees(c.sleutel)).toBe(c.waarde);
      });
    });
  });
});

describe('bronnencheck kan falen', () => {
  const pagina = '<html><script>var x=1</script><body>Banktegoeden:&nbsp;1,28%<br> Beleggingen: 6,00%</body></html>';
  test('vindt een letterlijk citaat, ook met tags en nbsp ertussen', () => {
    expect(platteTekst(pagina)).toContain('Banktegoeden: 1,28%');
    expect(citaatStaatErin(pagina, 'Banktegoeden: 1,28%')).toBe(true);
  });
  test('keurt een gewijzigd getal af', () => {
    expect(citaatStaatErin(pagina.replace('1,28%', '1,44%'), 'Banktegoeden: 1,28%')).toBe(false);
  });
});
