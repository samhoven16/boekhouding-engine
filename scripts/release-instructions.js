#!/usr/bin/env node
/**
 * scripts/release-instructions.js
 *
 * Release-helper voor klant-zichtbare updates. Mitigeert het sociaal-
 * technische risico uit STATUS_BUITENAARDS: als Sam vergeet
 * `VERSIE_KRITIEK_VOOR` bij te werken bij een kritieke release, ziet de
 * klant geen modal en doet 'ie onbewust BTW-aangifte met oude logica.
 *
 * Wat dit script doet:
 *   1. Leest de huidige HUIDIGE_VERSIE uit src/Onboarding.gs
 *   2. Vraagt of dit een kritieke release is (BTW/compliance/security)
 *   3. Bij ja: vraagt welke versies de fix missen + 1-zin toelichting
 *   4. Print een copy-paste-blok met de exacte licence-server-ScriptProperties
 *
 * Het schrijft GEEN files automatisch — laat Sam bewust copy-paste'en.
 *
 * Gebruik:
 *   npm run release:check                 (interactive)
 *   node scripts/release-instructions.js  (interactive)
 *
 * Of CLI-args (voor scripting + tests):
 *   node scripts/release-instructions.js normaal
 *   node scripts/release-instructions.js kritiek "2.7.0,2.6.0" "BTW r1d-correctie" [url]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ONBOARDING = path.join(ROOT, 'src/Onboarding.gs');

function leesHuidigeVersie() {
  const src = fs.readFileSync(ONBOARDING, 'utf8');
  const m = src.match(/const\s+HUIDIGE_VERSIE\s*=\s*['"]([^'"]+)['"]/);
  if (!m) throw new Error('HUIDIGE_VERSIE niet gevonden in src/Onboarding.gs');
  return m[1];
}

/**
 * Pure functie — genereert de output op basis van invoer. Geen I/O,
 * makkelijk testbaar. Throws Error met duidelijke melding bij invalid input.
 *
 * @param {object} input
 * @param {string} input.huidigeVersie  — "2.7.0"
 * @param {string} input.ernst          — "normaal" | "kritiek"
 * @param {string[]=} input.kritiekVoor — alleen voor kritiek
 * @param {string=} input.toelichting   — alleen voor kritiek
 * @param {string=} input.instructiesUrl — alleen voor kritiek, default https://boekhoudbaar.nl/update/
 * @returns {string} — copy-paste-bare Apps Script function-body
 */
function genereerInstructies(input) {
  const versie = String(input.huidigeVersie || '').trim();
  if (!versie) throw new Error('huidigeVersie verplicht');

  const ernst = String(input.ernst || '').toLowerCase();
  if (ernst !== 'normaal' && ernst !== 'kritiek') {
    throw new Error('ernst moet "normaal" of "kritiek" zijn');
  }

  if (ernst === 'normaal') {
    return [
      'function _setRelease_normaal() {',
      '  const p = PropertiesService.getScriptProperties();',
      "  p.setProperty('PRODUCT_VERSIE', '" + versie + "');",
      "  p.setProperty('VERSIE_ERNST', 'normaal');",
      "  p.setProperty('VERSIE_TOELICHTING', '');",
      "  p.setProperty('VERSIE_KRITIEK_VOOR', '[]');",
      "  Logger.log('Release config gezet voor " + versie + " (normaal).');",
      '}',
    ].join('\n');
  }

  // ernst === 'kritiek' — strenge validatie
  const kritiekVoor = (input.kritiekVoor || [])
    .map(function(s) { return String(s).trim(); }).filter(Boolean);
  if (kritiekVoor.length === 0) {
    throw new Error('kritieke release vereist minimaal één oude versie in kritiekVoor — zonder is de modal-flow zinloos');
  }
  if (kritiekVoor.indexOf(versie) >= 0) {
    throw new Error('huidige versie (' + versie + ') in kritiekVoor is zinloos — verwijder ' + versie + ' uit de lijst');
  }

  const toelichting = String(input.toelichting || '').trim();
  if (toelichting.length < 10) {
    throw new Error('toelichting te kort (' + toelichting.length + ' chars, min 10) — klant moet begrijpen waarom de update belangrijk is');
  }
  if (toelichting.length > 200) {
    throw new Error('toelichting te lang (' + toelichting.length + ' chars, max 200) — modal wordt onleesbaar');
  }

  const url = String(input.instructiesUrl || '').trim() || 'https://boekhoudbaar.nl/update/';

  return [
    'function _setRelease_kritiek() {',
    '  const p = PropertiesService.getScriptProperties();',
    "  p.setProperty('PRODUCT_VERSIE', '" + versie + "');",
    "  p.setProperty('VERSIE_ERNST', 'kritiek');",
    "  p.setProperty('VERSIE_TOELICHTING', " + JSON.stringify(toelichting) + ');',
    "  p.setProperty('VERSIE_INSTRUCTIES_URL', " + JSON.stringify(url) + ');',
    "  p.setProperty('VERSIE_KRITIEK_VOOR', " + JSON.stringify(JSON.stringify(kritiekVoor)) + ');',
    "  Logger.log('KRITIEKE release config gezet voor " + versie + ".');",
    "  Logger.log('Klanten op deze versies krijgen de modal: " + kritiekVoor.join(', ') + "');",
    '}',
  ].join('\n');
}

// CLI: ondersteunt zowel interactive (readline) als argv-mode voor scripting/tests.
function cliInteractive() {
  const readline = require('readline');
  const huidigeVersie = leesHuidigeVersie();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  function vraag(q) { return new Promise(function(r) { rl.question(q, r); }); }

  console.log('\n=== Boekhoudbaar release-helper ===\n');
  console.log('Lokale HUIDIGE_VERSIE in src/Onboarding.gs:  ' + huidigeVersie + '\n');

  (async function() {
    const isKritiek = (await vraag('Is dit een KRITIEKE release? [j/N]: ')).trim().toLowerCase();
    let out;
    if (isKritiek !== 'j' && isKritiek !== 'ja') {
      out = genereerInstructies({ huidigeVersie: huidigeVersie, ernst: 'normaal' });
    } else {
      const kritiekVoorRaw = (await vraag('Welke versies MISSEN deze fix? (komma-gescheiden): ')).trim();
      const toelichting = (await vraag('Korte toelichting (10-200 chars): ')).trim();
      const url = (await vraag('Instructies-URL (Enter = default): ')).trim();
      out = genereerInstructies({
        huidigeVersie: huidigeVersie,
        ernst: 'kritiek',
        kritiekVoor: kritiekVoorRaw.split(','),
        toelichting: toelichting,
        instructiesUrl: url,
      });
    }
    rl.close();
    console.log('\n--- Copy-paste in licence-server Apps Script editor ---\n');
    console.log(out);
    console.log('\nRun bovenstaande functie 1× in de editor.\n');
  })().catch(function(err) {
    rl.close();
    console.error('FOUT: ' + err.message);
    process.exit(1);
  });
}

function cliArgv(args) {
  const ernst = args[0];
  const huidigeVersie = leesHuidigeVersie();
  try {
    let out;
    if (ernst === 'normaal') {
      out = genereerInstructies({ huidigeVersie: huidigeVersie, ernst: 'normaal' });
    } else if (ernst === 'kritiek') {
      out = genereerInstructies({
        huidigeVersie: huidigeVersie,
        ernst: 'kritiek',
        kritiekVoor: (args[1] || '').split(','),
        toelichting: args[2],
        instructiesUrl: args[3],
      });
    } else {
      throw new Error('eerste argument moet "normaal" of "kritiek" zijn (kreeg: ' + ernst + ')');
    }
    console.log(out);
  } catch (err) {
    console.error('FOUT: ' + err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length > 0) cliArgv(args);
  else cliInteractive();
}

module.exports = { genereerInstructies, leesHuidigeVersie };
