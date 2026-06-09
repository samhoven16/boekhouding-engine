/**
 * tests/unit/gemini-model-eol-fix.test.js
 *
 * Audit-vondst (langlopend-onderhoud, 2026-06-09): gemini-2.0-flash is
 * door Google EOL gemaakt op 1 juni 2026 — AI bonscan was al 9 dagen
 * kapot in productie.
 *
 * Fix:
 *   • Constante _GEMINI_MODEL_DEFAULT = 'gemini-2.5-flash' (huidige stabiele)
 *   • Functie _geminiModel_() leest ScriptProperty 'GEMINI_MODEL' met
 *     fallback naar default. Klanten kunnen zelf upgraden bij volgende EOL.
 *   • Beide call-sites gebruiken nu _geminiModel_() ipv hardcoded string.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const SRC = path.resolve(__dirname, '../../src');
const bron = fs.readFileSync(path.join(SRC, 'BoekingEngine.gs'), 'utf8');

describe('BoekingEngine.gs — Gemini EOL fix bron', () => {
  test('Geen executable referentie naar gemini-2.0-flash meer (doc-comments mogen voor uitleg)', () => {
    const zonderComments = bron
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(zonderComments).not.toMatch(/gemini-2\.0-flash/);
  });

  test('Default-model is gemini-2.5-flash (huidige stabiele)', () => {
    expect(bron).toMatch(/_GEMINI_MODEL_DEFAULT\s*=\s*['"]gemini-2\.5-flash['"]/);
  });

  test('Helper _geminiModel_() bestaat met ScriptProperty-override-pad', () => {
    expect(bron).toMatch(/function _geminiModel_/);
    expect(bron).toMatch(/getProperty\(['"]GEMINI_MODEL['"]\)/);
  });

  test('Beide call-sites gebruiken _geminiModel_() in plaats van hardcoded string', () => {
    const matches = bron.match(/\/v1beta\/models\/['"] \+ _geminiModel_\(\)/g) || [];
    expect(matches.length).toBe(2);
  });

  test('Helper trimmed override (anti-whitespace klant-error)', () => {
    const start = bron.indexOf('function _geminiModel_');
    const eind = bron.indexOf('\nfunction ', start + 1);
    const blok = bron.slice(start, eind);
    expect(blok).toMatch(/v\.trim\(\)/);
  });

  test('Fail-safe: PropertiesService throwt → fallback naar default', () => {
    const start = bron.indexOf('function _geminiModel_');
    const eind = bron.indexOf('\nfunction ', start + 1);
    const blok = bron.slice(start, eind);
    expect(blok).toMatch(/try \{[\s\S]+\} catch \(_\) \{\}/);
    expect(blok).toMatch(/return _GEMINI_MODEL_DEFAULT/);
  });

  test('Commentaar documenteert WAAROM (EOL 1-juni-2026) + upgrade-pad', () => {
    expect(bron).toMatch(/EOL.*1 juni 2026/i);
    expect(bron).toMatch(/ScriptProperty.*GEMINI_MODEL|GEMINI_MODIL.*ScriptProperty/i);
  });
});

describe('Functionele simulatie — _geminiModel_ gedrag', () => {
  let ctx;

  beforeEach(() => {
    ctx = createGasRuntime(['BoekingEngine.gs']);
  });

  test('Geen ScriptProperty gezet → default gemini-2.5-flash', () => {
    ctx.PropertiesService.getScriptProperties = jest.fn(() => ({
      getProperty: jest.fn(() => null),
    }));
    expect(ctx._geminiModel_()).toBe('gemini-2.5-flash');
  });

  test('Override gezet → klant-keuze geretourneerd', () => {
    ctx.PropertiesService.getScriptProperties = jest.fn(() => ({
      getProperty: jest.fn(function(k) {
        return k === 'GEMINI_MODEL' ? 'gemini-3.0-pro' : null;
      }),
    }));
    expect(ctx._geminiModel_()).toBe('gemini-3.0-pro');
  });

  test('Lege string override → default fallback', () => {
    ctx.PropertiesService.getScriptProperties = jest.fn(() => ({
      getProperty: jest.fn(() => ''),
    }));
    expect(ctx._geminiModel_()).toBe('gemini-2.5-flash');
  });

  test('Whitespace-only override → default fallback', () => {
    ctx.PropertiesService.getScriptProperties = jest.fn(() => ({
      getProperty: jest.fn(() => '   '),
    }));
    expect(ctx._geminiModel_()).toBe('gemini-2.5-flash');
  });

  test('Override met whitespace om naam → getrimd', () => {
    ctx.PropertiesService.getScriptProperties = jest.fn(() => ({
      getProperty: jest.fn(() => '  gemini-2.5-flash  '),
    }));
    expect(ctx._geminiModel_()).toBe('gemini-2.5-flash');
  });

  test('PropertiesService throwt → fallback naar default (geen crash)', () => {
    ctx.PropertiesService.getScriptProperties = jest.fn(() => {
      throw new Error('LIMITED auth');
    });
    expect(ctx._geminiModel_()).toBe('gemini-2.5-flash');
  });
});

describe('Anti-regressie: AI-scan endpoint blijft veilig', () => {
  test('Endpoint blijft v1beta (generativelanguage.googleapis.com)', () => {
    expect(bron).toMatch(/generativelanguage\.googleapis\.com\/v1beta\/models/);
  });

  test('OWASP LLM01-mitigatie tegen prompt-injection blijft (KRITIEKE VEILIGHEIDSREGEL)', () => {
    expect(bron).toMatch(/KRITIEKE VEILIGHEIDSREGEL/);
  });

  test('OWASP LLM10-mitigatie: rate-limit 30/uur blijft', () => {
    expect(bron).toMatch(/rateLimit_\(['"]ai-scan['"], 30/);
  });
});
