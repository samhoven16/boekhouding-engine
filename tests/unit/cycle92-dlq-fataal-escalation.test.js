/**
 * tests/unit/cycle92-dlq-fataal-escalation.test.js
 *
 * Cycle 92 — DLQ fataal-escalatie via meerdere onafhankelijke kanalen.
 *
 * Aanleiding: één kanaal (meldFataalAanOwner_ → MailApp) is onvoldoende.
 * Mail-quota kan op zijn, of de owner-mail zelf is de gefaalde actie. Test
 * borgt dat:
 *   - Audit-log nogmaals geschreven wordt
 *   - ScriptProperty DLQ_LAATSTE_FATAAL gevuld wordt (persistent, leesbaar
 *     in editor zelfs zonder sheet)
 *   - DLQ-sheet zichtbaar wordt gemaakt (showSheet) zodat klant het ziet
 *   - meldFataalAanOwner_ aangeroepen wordt (best-effort)
 *   - Eén kanaal-fout blokkeert de andere kanalen NIET (defense-in-depth)
 */
'use strict';

const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const SRC = path.resolve(__dirname, '../../src');

function maakDlqSheetMock(rows) {
  // rows = 2D array zonder header. We faken alleen de status-kolom (idx 5).
  const headers = ['Tijdstip','Type','Payload (JSON)','Fout','Retries','Status','Volgende retry'];
  const all = [headers].concat(rows);
  return {
    getDataRange: () => ({ getValues: () => all }),
    getLastRow: () => all.length,
    getRange: jest.fn(() => ({ setValue: jest.fn() })),
    showSheet: jest.fn(),
    hideSheet: jest.fn(),
  };
}

function maakCtx(overrides) {
  const propStore = {};
  return createGasRuntime(['DLQ.gs'], Object.assign({
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in propStore ? propStore[k] : null),
        setProperty: (k, v) => { propStore[k] = v; },
        deleteProperty: (k) => { delete propStore[k]; },
      }),
      getUserProperties: () => ({ getProperty: () => null, setProperty: () => {} }),
    },
    // safeAuditLog_ wordt door gas-runtime via prelude gedeclareerd en delegeert
    // naar schrijfAuditLog_; daar grijpen we op aan
    schrijfAuditLog_: jest.fn(),
    meldFataalAanOwner_: jest.fn(),
    __propStore: propStore,
  }, overrides || {}));
}

describe('CYCLE 92: escaleerDlqFataal_ — meerkanaals fail-loud', () => {
  test('schrijft audit-log + ScriptProperty + showSheet + meldFataalAanOwner_', () => {
    const ctx = maakCtx();
    const sheet = maakDlqSheetMock([
      ['2026-01-01', 'EMAIL_FACTUUR', '{}', 'oude fout', 3, 'FAILED', '2026-01-02'],
    ]);

    ctx.escaleerDlqFataal_(sheet, null, 'EMAIL_FACTUUR', { factuurnr: '2026-001' }, 'TimeoutError');

    expect(ctx.schrijfAuditLog_).toHaveBeenCalledWith(
      'DLQ FATAAL-escalatie',
      expect.stringContaining('EMAIL_FACTUUR')
    );
    expect(sheet.showSheet).toHaveBeenCalledTimes(1);
    expect(ctx.meldFataalAanOwner_).toHaveBeenCalledWith(
      'DLQ_FAILED',
      expect.stringContaining('EMAIL_FACTUUR'),
      expect.objectContaining({ payload: expect.objectContaining({ factuurnr: '2026-001' }) })
    );

    const persisted = JSON.parse(ctx.__propStore['DLQ_LAATSTE_FATAAL']);
    expect(persisted.type).toBe('EMAIL_FACTUUR');
    expect(persisted.fout).toBe('TimeoutError');
    expect(persisted.totaalFailed).toBe(1);
    expect(persisted.tijdstip).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('telDlqFailed_ telt alleen FAILED rijen, niet PENDING of SUCCES', () => {
    const ctx = maakCtx();
    const sheet = maakDlqSheetMock([
      ['', 'A', '{}', '', 1, 'PENDING', ''],
      ['', 'B', '{}', '', 3, 'FAILED', ''],
      ['', 'C', '{}', '', 3, 'FAILED', ''],
      ['', 'D', '{}', '', 2, 'SUCCES', ''],
    ]);
    expect(ctx.telDlqFailed_(sheet)).toBe(2);
  });

  test('telDlqFailed_ lege sheet → 0', () => {
    const ctx = maakCtx();
    const leeg = { getLastRow: () => 1, getDataRange: () => ({ getValues: () => [['h']] }) };
    expect(ctx.telDlqFailed_(leeg)).toBe(0);
    expect(ctx.telDlqFailed_(null)).toBe(0);
  });

  test('audit-log-fout blokkeert ScriptProperty en showSheet NIET', () => {
    const ctx = maakCtx({
      schrijfAuditLog_: () => { throw new Error('audit unavailable'); },
    });
    const sheet = maakDlqSheetMock([
      ['', 'X', '{}', '', 3, 'FAILED', ''],
    ]);
    expect(() => ctx.escaleerDlqFataal_(sheet, null, 'X', {}, 'err')).not.toThrow();
    expect(sheet.showSheet).toHaveBeenCalled();
    expect(ctx.__propStore['DLQ_LAATSTE_FATAAL']).toBeDefined();
  });

  test('showSheet-fout blokkeert mail-alert NIET', () => {
    const ctx = maakCtx();
    const sheet = {
      getLastRow: () => 2,
      getDataRange: () => ({ getValues: () => [['h'], ['', 'X', '{}', '', 3, 'FAILED', '']] }),
      showSheet: () => { throw new Error('not allowed'); },
    };
    expect(() => ctx.escaleerDlqFataal_(sheet, null, 'X', {}, 'err')).not.toThrow();
    expect(ctx.meldFataalAanOwner_).toHaveBeenCalled();
  });

  test('mail-fout blokkeert NIET — andere kanalen blijven werken', () => {
    const ctx = maakCtx({
      meldFataalAanOwner_: () => { throw new Error('mail quota up'); },
    });
    const sheet = maakDlqSheetMock([
      ['', 'X', '{}', '', 3, 'FAILED', ''],
    ]);
    expect(() => ctx.escaleerDlqFataal_(sheet, null, 'X', {}, 'err')).not.toThrow();
    expect(sheet.showSheet).toHaveBeenCalled();
    expect(ctx.__propStore['DLQ_LAATSTE_FATAAL']).toBeDefined();
  });
});

describe('CYCLE 92: getDlqLaatsteFataalProp_ — read-only support helper', () => {
  test('null als geen property gezet', () => {
    const ctx = maakCtx();
    expect(ctx.getDlqLaatsteFataalProp_()).toBeNull();
  });

  test('returnt geparsed object als property gezet is', () => {
    const ctx = maakCtx();
    ctx.__propStore['DLQ_LAATSTE_FATAAL'] = JSON.stringify({
      tijdstip: '2026-06-04T07:00:00Z',
      type: 'EMAIL_FACTUUR',
      fout: 'X',
      totaalFailed: 5,
    });
    const r = ctx.getDlqLaatsteFataalProp_();
    expect(r.type).toBe('EMAIL_FACTUUR');
    expect(r.totaalFailed).toBe(5);
  });

  test('corrupte JSON → null (geen crash)', () => {
    const ctx = maakCtx();
    ctx.__propStore['DLQ_LAATSTE_FATAAL'] = 'niet-json{';
    expect(ctx.getDlqLaatsteFataalProp_()).toBeNull();
  });
});
