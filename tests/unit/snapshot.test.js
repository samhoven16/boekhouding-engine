'use strict';
/**
 * tests/unit/snapshot.test.js
 *
 * Regression tests for the KPI Snapshot read/write contract (Utils.gs).
 *
 * The snapshot is the materialized read-model for financial KPIs.
 * These tests prove:
 *   1. Round-trip correctness (write → read returns same data)
 *   2. Schema metadata (_v, _generatedAt) is injected on write
 *   3. Staleness window is enforced
 *   4. Corrupt JSON never crashes callers — returns null
 *   5. Schema version mismatch returns null (forces recompute)
 *   6. Missing required fields returns null
 *   7. invalideerKpiSnapshot_ forces null on next read
 *   8. Silent failure on write does not throw
 */

const { createGasRuntime } = require('../__helpers__/gas-runtime');

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Returns a PropertiesService mock backed by a real in-memory store,
 * so round-trip tests (write then read) work correctly.
 */
function makeRealStore() {
  const store = {};
  return {
    getProperty:    jest.fn(k => (k in store ? store[k] : null)),
    setProperty:    jest.fn((k, v) => { store[k] = String(v); }),
    deleteProperty: jest.fn(k => { delete store[k]; }),
    setProperties:  jest.fn(),
    _store:         store, // expose for test assertions
  };
}

/** Minimal valid KPI object — all required fields present and numeric. */
const VALID_KPI = {
  omzet:            45000,
  kosten:           22000,
  nettowinst:       23000,
  winstmarge:       51.1,
  banksaldo:        12000,
  debiteurenOpen:   8500,
  crediteurenOpen:  3200,
  btwSaldo:         2800,
  aantalOpenFacturen: 4,
  debiteurendagen:  18,
  verwachtIn30d:    5000,
  burnRate:         1833,
  runway:           6,
  liquiditeit:      null,
  solvabiliteit:    null,
};

// GAS note: `const` declarations in .gs files are NOT accessible as ctx.X properties
// (block-scoped in vm — see .claude/test-map.md). Use literal values for constants.
const KPI_SNAPSHOT_KEY    = 'kpiSnapshot'; // PROP.KPI_SNAPSHOT
const SCHEMA_VERSION      = 2;             // SNAPSHOT_SCHEMA_VERSION (bumped v1→v2 apr 2026 voor 8-KPI sidebar)

// ── Test suite ─────────────────────────────────────────────────────────────

describe('KPI Snapshot (Utils.gs)', () => {
  let ctx;
  let mockProps;

  beforeEach(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs']);
    mockProps = makeRealStore();
    ctx.PropertiesService = { getScriptProperties: jest.fn(() => mockProps) };
  });

  // ── 1. Round-trip correctness ────────────────────────────────────────────

  describe('schrijfKpiSnapshot_ + leesKpiSnapshot_ — round-trip', () => {
    it('fresh snapshot returns the written KPI data', () => {
      ctx.schrijfKpiSnapshot_(VALID_KPI);
      const result = ctx.leesKpiSnapshot_();
      expect(result).not.toBeNull();
      expect(result.omzet).toBe(45000);
      expect(result.debiteurenOpen).toBe(8500);
      expect(result.btwSaldo).toBe(2800);
      expect(result.nettowinst).toBe(23000);
    });

    it('original kpiObj is not mutated by schrijfKpiSnapshot_', () => {
      const copy = Object.assign({}, VALID_KPI);
      ctx.schrijfKpiSnapshot_(VALID_KPI);
      expect(VALID_KPI).toEqual(copy);
    });
  });

  // ── 2. Schema metadata injected on write ─────────────────────────────────

  describe('schrijfKpiSnapshot_ — metadata', () => {
    it('injects _v matching SNAPSHOT_SCHEMA_VERSION into data', () => {
      ctx.schrijfKpiSnapshot_(VALID_KPI);
      const result = ctx.leesKpiSnapshot_();
      expect(result._v).toBe(SCHEMA_VERSION);
    });

    it('injects _generatedAt ISO timestamp into data', () => {
      ctx.schrijfKpiSnapshot_(VALID_KPI);
      const result = ctx.leesKpiSnapshot_();
      expect(typeof result._generatedAt).toBe('string');
      expect(result._generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('wrapper contains schema version v = SNAPSHOT_SCHEMA_VERSION', () => {
      ctx.schrijfKpiSnapshot_(VALID_KPI);
      const raw = mockProps._store[KPI_SNAPSHOT_KEY];
      const parsed = JSON.parse(raw);
      expect(parsed.v).toBe(SCHEMA_VERSION);
    });

    it('wrapper contains numeric ts close to Date.now()', () => {
      const before = Date.now();
      ctx.schrijfKpiSnapshot_(VALID_KPI);
      const after = Date.now();
      const raw = mockProps._store[KPI_SNAPSHOT_KEY];
      const { ts } = JSON.parse(raw);
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });
  });

  // ── 3. Staleness enforcement ─────────────────────────────────────────────

  describe('leesKpiSnapshot_ — staleness', () => {
    it('returns null when snapshot is older than default 30-minute window', () => {
      const stalePayload = JSON.stringify({
        v: SCHEMA_VERSION,
        ts: Date.now() - 31 * 60 * 1000, // 31 minutes ago
        data: Object.assign({}, VALID_KPI, { _v: SCHEMA_VERSION, _generatedAt: new Date().toISOString() }),
      });
      mockProps._store[KPI_SNAPSHOT_KEY] = stalePayload;
      expect(ctx.leesKpiSnapshot_()).toBeNull();
    });

    it('returns data when snapshot is within custom maxAgeMs', () => {
      ctx.schrijfKpiSnapshot_(VALID_KPI);
      const result = ctx.leesKpiSnapshot_(60 * 60 * 1000); // 1 hour window
      expect(result).not.toBeNull();
      expect(result.omzet).toBe(45000);
    });

    it('returns null when custom maxAgeMs is exceeded', () => {
      const oldPayload = JSON.stringify({
        v: SCHEMA_VERSION,
        ts: Date.now() - 5000, // 5 seconds ago
        data: Object.assign({}, VALID_KPI, { _v: SCHEMA_VERSION, _generatedAt: new Date().toISOString() }),
      });
      mockProps._store[KPI_SNAPSHOT_KEY] = oldPayload;
      expect(ctx.leesKpiSnapshot_(2000)).toBeNull(); // only 2 second window
    });
  });

  // ── 4. Corrupt JSON safety ───────────────────────────────────────────────

  describe('leesKpiSnapshot_ — corrupt JSON', () => {
    it('returns null for completely invalid JSON', () => {
      mockProps._store[KPI_SNAPSHOT_KEY] = 'not-valid{{{json';
      expect(ctx.leesKpiSnapshot_()).toBeNull();
    });

    it('returns null for empty string', () => {
      mockProps._store[KPI_SNAPSHOT_KEY] = '';
      expect(ctx.leesKpiSnapshot_()).toBeNull();
    });

    it('returns null when data field is missing from wrapper', () => {
      const noData = JSON.stringify({ v: SCHEMA_VERSION, ts: Date.now() });
      mockProps._store[KPI_SNAPSHOT_KEY] = noData;
      expect(ctx.leesKpiSnapshot_()).toBeNull();
    });

    it('returns null when ts field is missing from wrapper', () => {
      const noTs = JSON.stringify({ v: SCHEMA_VERSION, data: VALID_KPI });
      mockProps._store[KPI_SNAPSHOT_KEY] = noTs;
      expect(ctx.leesKpiSnapshot_()).toBeNull();
    });

    it('returns null when no snapshot exists at all', () => {
      expect(ctx.leesKpiSnapshot_()).toBeNull();
    });
  });

  // ── 5. Schema version mismatch ───────────────────────────────────────────

  describe('leesKpiSnapshot_ — schema version', () => {
    it('returns null when wrapper version does not match SNAPSHOT_SCHEMA_VERSION', () => {
      const wrongV = JSON.stringify({
        v: 99, // wrong version
        ts: Date.now(),
        data: Object.assign({}, VALID_KPI, { _v: 99, _generatedAt: new Date().toISOString() }),
      });
      mockProps._store[KPI_SNAPSHOT_KEY] = wrongV;
      expect(ctx.leesKpiSnapshot_()).toBeNull();
    });

    it('returns null when wrapper version is 0 (unversioned legacy)', () => {
      const legacyV = JSON.stringify({ v: 0, ts: Date.now(), data: VALID_KPI });
      mockProps._store[KPI_SNAPSHOT_KEY] = legacyV;
      expect(ctx.leesKpiSnapshot_()).toBeNull();
    });
  });

  // ── 6. Required-field structural validation ──────────────────────────────

  describe('leesKpiSnapshot_ — required field validation', () => {
    const REQUIRED = ['omzet', 'kosten', 'nettowinst', 'banksaldo', 'debiteurenOpen', 'btwSaldo'];

    REQUIRED.forEach(field => {
      it(`returns null when required field '${field}' is missing`, () => {
        const partial = Object.assign({}, VALID_KPI, { _v: SCHEMA_VERSION, _generatedAt: new Date().toISOString() });
        delete partial[field];
        const payload = JSON.stringify({ v: SCHEMA_VERSION, ts: Date.now(), data: partial });
        mockProps._store[KPI_SNAPSHOT_KEY] = payload;
        expect(ctx.leesKpiSnapshot_()).toBeNull();
      });

      it(`returns null when required field '${field}' is a string`, () => {
        const badType = Object.assign({}, VALID_KPI, {
          _v: SCHEMA_VERSION,
          _generatedAt: new Date().toISOString(),
          [field]: 'not-a-number',
        });
        const payload = JSON.stringify({ v: SCHEMA_VERSION, ts: Date.now(), data: badType });
        mockProps._store[KPI_SNAPSHOT_KEY] = payload;
        expect(ctx.leesKpiSnapshot_()).toBeNull();
      });
    });

    it('accepts 0 as a valid value for numeric fields (not just truthy check)', () => {
      const zeroKpi = Object.assign({}, VALID_KPI, {
        omzet: 0, kosten: 0, nettowinst: 0, banksaldo: 0, debiteurenOpen: 0, btwSaldo: 0,
        _v: SCHEMA_VERSION, _generatedAt: new Date().toISOString(),
      });
      const payload = JSON.stringify({ v: SCHEMA_VERSION, ts: Date.now(), data: zeroKpi });
      mockProps._store[KPI_SNAPSHOT_KEY] = payload;
      const result = ctx.leesKpiSnapshot_();
      expect(result).not.toBeNull();
      expect(result.omzet).toBe(0);
      expect(result.debiteurenOpen).toBe(0);
    });
  });

  // ── 7. invalideerKpiSnapshot_ ────────────────────────────────────────────

  describe('invalideerKpiSnapshot_', () => {
    it('causes leesKpiSnapshot_ to return null after invalidation', () => {
      ctx.schrijfKpiSnapshot_(VALID_KPI);
      expect(ctx.leesKpiSnapshot_()).not.toBeNull(); // sanity: snapshot exists
      ctx.invalideerKpiSnapshot_();
      expect(ctx.leesKpiSnapshot_()).toBeNull();
    });

    it('calls deleteProperty with the correct key', () => {
      ctx.invalideerKpiSnapshot_();
      expect(mockProps.deleteProperty).toHaveBeenCalledWith(KPI_SNAPSHOT_KEY);
    });

    it('does not throw when no snapshot exists', () => {
      expect(() => ctx.invalideerKpiSnapshot_()).not.toThrow();
    });

    it('can be called multiple times safely', () => {
      ctx.schrijfKpiSnapshot_(VALID_KPI);
      ctx.invalideerKpiSnapshot_();
      expect(() => ctx.invalideerKpiSnapshot_()).not.toThrow();
      expect(ctx.leesKpiSnapshot_()).toBeNull();
    });
  });

  // ── 8. schrijfKpiSnapshot_ failure safety ────────────────────────────────

  describe('schrijfKpiSnapshot_ — failure safety', () => {
    it('does not throw when setProperty throws', () => {
      mockProps.setProperty.mockImplementation(() => { throw new Error('Properties quota exceeded'); });
      expect(() => ctx.schrijfKpiSnapshot_(VALID_KPI)).not.toThrow();
    });

    it('logs the error when setProperty throws', () => {
      mockProps.setProperty.mockImplementation(() => { throw new Error('quota'); });
      ctx.schrijfKpiSnapshot_(VALID_KPI);
      expect(ctx.Logger.log).toHaveBeenCalledWith(expect.stringMatching(/snapshot schrijven mislukt/));
    });
  });
});
