/**
 * tests/unit/pattern-wrappers.test.js
 *
 * Tests voor withLock_, withRetry_, withCheckpoint_ (Utils.gs).
 * Conform masterplan maand 2 vereiste: één centrale implementatie van patronen
 * die overal in de codebase ontstaan.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

describe('withLock_', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs']);
    ctx.schrijfAuditLog_ = () => {};
  });

  test('succesvolle fn → return-waarde doorgegeven', () => {
    const lockMock = { tryLock: jest.fn(() => true), releaseLock: jest.fn() };
    ctx.LockService = { getScriptLock: () => lockMock };
    const result = ctx.withLock_('test', 1000, () => 42);
    expect(result).toBe(42);
    expect(lockMock.releaseLock).toHaveBeenCalled();
  });

  test('lock-timeout → throw met klant-leesbare melding', () => {
    const lockMock = { tryLock: () => false, releaseLock: jest.fn() };
    ctx.LockService = { getScriptLock: () => lockMock };
    expect(() => ctx.withLock_('test', 1000, () => 42))
      .toThrow(/Lock-timeout|andere actie is bezig/);
  });

  test('fn gooit → lock wordt nog steeds vrijgegeven', () => {
    const lockMock = { tryLock: jest.fn(() => true), releaseLock: jest.fn() };
    ctx.LockService = { getScriptLock: () => lockMock };
    expect(() => ctx.withLock_('test', 1000, () => { throw new Error('boom'); }))
      .toThrow('boom');
    expect(lockMock.releaseLock).toHaveBeenCalled();
  });

  test('default timeout 30000ms gebruikt bij undefined', () => {
    const lockMock = { tryLock: jest.fn(() => true), releaseLock: jest.fn() };
    ctx.LockService = { getScriptLock: () => lockMock };
    ctx.withLock_('test', undefined, () => 1);
    expect(lockMock.tryLock).toHaveBeenCalledWith(30000);
  });
});

describe('withRetry_', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs']);
    // Mock Utilities.sleep om tests snel te houden
    ctx.Utilities = { sleep: jest.fn() };
  });

  test('eerste poging slaagt → geen retry', () => {
    let calls = 0;
    const result = ctx.withRetry_(3, () => { calls++; return 'ok'; });
    expect(result).toBe('ok');
    expect(calls).toBe(1);
  });

  test('faalt 2× dan slaagt → 3 calls totaal', () => {
    let calls = 0;
    const result = ctx.withRetry_(3, () => {
      calls++;
      if (calls < 3) throw new Error('transient');
      return 'eindelijk';
    });
    expect(result).toBe('eindelijk');
    expect(calls).toBe(3);
  });

  test('faalt alle pogingen → throw laatste fout', () => {
    expect(() => ctx.withRetry_(3, () => { throw new Error('blijft falen'); }))
      .toThrow('blijft falen');
  });

  test('shouldRetry false → niet retryen (4xx-pattern)', () => {
    let calls = 0;
    expect(() => ctx.withRetry_(3,
      () => { calls++; throw new Error('400 Bad Request'); },
      (e) => e.message.indexOf('400') === -1
    )).toThrow('400');
    expect(calls).toBe(1);
  });

  test('default 3 pogingen bij undefined maxPogingen', () => {
    let calls = 0;
    expect(() => ctx.withRetry_(undefined, () => { calls++; throw new Error('x'); }))
      .toThrow();
    expect(calls).toBe(3);
  });
});

describe('setCheckpoint_/getCheckpoint_/clearCheckpoint_', () => {
  let ctx;
  let storage;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs']);
    storage = {};
    ctx.PropertiesService = {
      getScriptProperties: () => ({
        getProperty: (k) => storage[k] || null,
        setProperty: (k, v) => { storage[k] = v; },
        deleteProperty: (k) => { delete storage[k]; },
      }),
    };
  });

  beforeEach(() => {
    storage = {};
    ctx.PropertiesService = {
      getScriptProperties: () => ({
        getProperty: (k) => storage[k] || null,
        setProperty: (k, v) => { storage[k] = v; },
        deleteProperty: (k) => { delete storage[k]; },
      }),
    };
  });

  test('set + get round-trip', () => {
    ctx.setCheckpoint_('taak1', 'stap-a', { teller: 5 });
    const r = ctx.getCheckpoint_('taak1');
    expect(r.stap).toBe('stap-a');
    expect(r.state.teller).toBe(5);
    expect(typeof r.ts).toBe('number');
  });

  test('geen checkpoint → null', () => {
    expect(ctx.getCheckpoint_('niet-bestaand')).toBeNull();
  });

  test('clear verwijdert', () => {
    ctx.setCheckpoint_('taak2', 'stap-b');
    ctx.clearCheckpoint_('taak2');
    expect(ctx.getCheckpoint_('taak2')).toBeNull();
  });

  test('corrupte JSON → null (geen crash)', () => {
    storage['CKPT_corrupt'] = 'niet-json{{';
    expect(ctx.getCheckpoint_('corrupt')).toBeNull();
  });
});

describe('withCheckpoint_', () => {
  let ctx;
  let storage;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs']);
    ctx.schrijfAuditLog_ = () => {};
  });

  beforeEach(() => {
    storage = {};
    ctx.PropertiesService = {
      getScriptProperties: () => ({
        getProperty: (k) => storage[k] || null,
        setProperty: (k, v) => { storage[k] = v; },
        deleteProperty: (k) => { delete storage[k]; },
      }),
    };
  });

  test('alle stappen succesvol → checkpoint gewist', () => {
    const stappen = [
      { naam: 'a', fn: () => {} },
      { naam: 'b', fn: () => {} },
      { naam: 'c', fn: () => {} },
    ];
    const r = ctx.withCheckpoint_('jaarafsl', stappen);
    expect(r.voltooid).toBe(true);
    expect(r.laatsteStap).toBe('c');
    expect(storage['CKPT_jaarafsl']).toBeUndefined();
  });

  test('faal bij stap b → checkpoint blijft op a', () => {
    const stappen = [
      { naam: 'a', fn: () => {} },
      { naam: 'b', fn: () => { throw new Error('boem'); } },
      { naam: 'c', fn: () => {} },
    ];
    expect(() => ctx.withCheckpoint_('faaltaak', stappen)).toThrow('boem');
    const ckpt = JSON.parse(storage['CKPT_faaltaak']);
    expect(ckpt.stap).toBe('a');
  });

  test('hervatten vanaf checkpoint a → start bij b', () => {
    storage['CKPT_resumetaak'] = JSON.stringify({ stap: 'a', ts: Date.now(), state: {} });
    const uitgevoerd = [];
    const stappen = [
      { naam: 'a', fn: () => uitgevoerd.push('a') },
      { naam: 'b', fn: () => uitgevoerd.push('b') },
      { naam: 'c', fn: () => uitgevoerd.push('c') },
    ];
    ctx.withCheckpoint_('resumetaak', stappen);
    expect(uitgevoerd).toEqual(['b', 'c']);  // 'a' overgeslagen
  });

  test('state wordt doorgegeven aan volgende stap', () => {
    storage['CKPT_statestaak'] = JSON.stringify({ stap: 'a', ts: Date.now(), state: { totaal: 100 } });
    let gezien = null;
    const stappen = [
      { naam: 'a', fn: () => {} },
      { naam: 'b', fn: (state) => { gezien = state.totaal; } },
    ];
    ctx.withCheckpoint_('statestaak', stappen);
    expect(gezien).toBe(100);
  });
});
