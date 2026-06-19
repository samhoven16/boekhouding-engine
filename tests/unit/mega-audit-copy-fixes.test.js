/**
 * tests/unit/mega-audit-copy-fixes.test.js
 *
 * Mega-audit 2026-06-18 — borgt de copy-/config-correcties zodat ze niet
 * terugkeren (de meeste hebben geen runtime-seam, dus broncode-asserties).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '../../', p), 'utf8');

describe('E6/E7 — drip-mails: geen valse beloftes / niet-bestaande menupaden', () => {
  const code = read('licence-server/Code.gs');
  test('geen ZIP/XLSX/JSONL-exportpakket-claim meer', () => {
    expect(code).not.toMatch(/ZIP met PDF \+ XLSX \+ JSONL/);
    expect(code).not.toMatch(/ZIP voor elk pakket/);
  });
  test('geen verzonnen menupaden ("Werkt-alles-test", "Boekhouding → Controle/BTW")', () => {
    expect(code).not.toMatch(/Werkt-alles-test/);
    expect(code).not.toMatch(/Boekhouding → Controle/);
    expect(code).not.toMatch(/Boekhouding → BTW/);
  });
  test('verwijst naar het echte exportpakket (Drive-map + XAF)', () => {
    expect(code).toMatch(/map in je eigen Drive met CSV/);
  });
});

describe('W1 — F-DOC-130-rest: geen "read-only / auto-expires"-claim meer', () => {
  test('homepage', () => {
    expect(read('website/index.html')).not.toMatch(/[Rr]ead-only deelflow/);
  });
  test('Engelse pagina', () => {
    const en = read('website/en/index.html');
    expect(en).not.toMatch(/auto-expires after 30/);
    expect(en).not.toMatch(/[Rr]ead-only sharing/);
  });
});

describe('W3 — /start: oefen-replica verbergt het "onveilig"-linkje tot de klik', () => {
  test('geen inline display:block op .uitgeklapt-blok', () => {
    expect(read('website/start/index.html')).not.toMatch(/uitgeklapt-blok"\s+style="display:block"/);
  });
});

describe('E8 — E-mailnotificatie-toggle is vindbaar in het Instellingen-tabblad', () => {
  test("Setup.gs seedt ['E-mailnotificaties', 'Ja']", () => {
    expect(read('src/Setup.gs')).toMatch(/\['E-mailnotificaties',\s*'Ja'\]/);
  });
});
