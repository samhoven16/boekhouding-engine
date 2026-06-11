/**
 * tests/unit/google-script-run-naar-publieke-functie.test.js
 *
 * Apps Script-regel: functies met trailing `_` zijn privé en NIET
 * bereikbaar via google.script.run vanuit HTML-dialogs/sidebars. Een
 * aanroep .foo_() vanuit HTML faalt stil of met een onbegrijpelijke
 * fout — voor de klant uitsluitend zichtbaar als "knop doet niks".
 *
 * Deze klasse-bug heeft Boekhoudbaar al drie keer geraakt:
 *   • AVG opt-in formulier (aanvraagVerwijderOtp_ → publiek gemaakt)
 *   • NPS modal (slaNpsResponseOp_ → publiek gemaakt, zie Engagement.gs:225)
 *   • KIA-rekenmachine (berekenInvesteringsAftrek_) + Moneybird XAF-import
 *     (verwerkXafBestand_) → deze test geboren
 *
 * Test scant ALLE .gs-bestanden onder src/ op `google.script.run.<naam>_(`
 * patronen, ook door een chain van .withXxxHandler(...)-calls heen.
 * Doel = uitsluitend deze klasse-bug; complexere bugs (typo's, ontbrekende
 * functies) zijn productie-zichtbaar bij eerste klik.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.resolve(__dirname, '../../src');

function leesAlleGs() {
  const out = {};
  fs.readdirSync(SRC_DIR).forEach(function(f) {
    if (f.endsWith('.gs')) out[f] = fs.readFileSync(path.join(SRC_DIR, f), 'utf8');
  });
  return out;
}

/**
 * Vindt elke `google.script.run...XXX_(` waar XXX_ eindigt op underscore.
 * De chain mag arbitraire .withXxxHandler(...)-calls bevatten; we slaan
 * daar overheen totdat we de target-call-met-trailing-_ tegenkomen.
 *
 * @returns {Array<{file:string,naam:string,regel:number}>}
 */
function vindPriveRpcTargets(bronPerFile) {
  const HANDLERS = /^(withSuccessHandler|withFailureHandler|withUserObject)$/;
  const treffers = [];
  Object.keys(bronPerFile).forEach(function(file) {
    const bron = bronPerFile[file];
    let idx = 0;
    while ((idx = bron.indexOf('google.script.run', idx)) !== -1) {
      // Loop alle .methodName(...) calls in de chain af
      let p = idx + 'google.script.run'.length;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // Sla whitespace + newlines + comments over
        while (p < bron.length && /\s/.test(bron[p])) p++;
        if (bron[p] !== '.') break;
        p++; // skip '.'
        // Lees methodName
        const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(bron.substring(p));
        if (!m) break;
        const naam = m[1];
        p += m[0].length;
        // Skip de args — balanced paren
        let diepte = 1;
        while (p < bron.length && diepte > 0) {
          const c = bron[p];
          if (c === '(') diepte++;
          else if (c === ')') diepte--;
          else if (c === '"' || c === "'" || c === '`') {
            // Skip string
            const q = c; p++;
            while (p < bron.length && bron[p] !== q) {
              if (bron[p] === '\\') p++;
              p++;
            }
          }
          p++;
        }
        // Is dit een handler? Dan door naar volgende .x(
        if (HANDLERS.test(naam)) continue;
        // Anders: dit is de RPC target. Check trailing _.
        if (naam.endsWith('_')) {
          const regel = bron.substring(0, idx).split('\n').length;
          treffers.push({ file: file, naam: naam, regel: regel });
        }
        break; // klaar met deze chain
      }
      idx = p;
    }
  });
  return treffers;
}

describe('google.script.run mag geen trailing-underscore-functie aanroepen', () => {
  const bron = leesAlleGs();
  const treffers = vindPriveRpcTargets(bron);

  test('geen privé-functies als RPC-target', () => {
    if (treffers.length > 0) {
      const lijst = treffers.map(function(t) {
        return '  ' + t.file + ':' + t.regel + ' → google.script.run...' + t.naam + '()';
      }).join('\n');
      throw new Error(
        'google.script.run aanroept ' + treffers.length + ' privé-functie(s):\n' + lijst +
        '\n\nApps Script blokkeert functies met trailing _ vanuit HTML.\n' +
        'Fix: hernoem de server-functie naar de publieke variant (zonder _)\n' +
        'en pas de aanroep in de HTML aan.'
      );
    }
  });
});
