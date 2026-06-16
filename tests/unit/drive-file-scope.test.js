/**
 * tests/unit/drive-file-scope.test.js
 *
 * #4 Google-scope-minimalisatie, stap 2 — Drive → drive.file.
 * De RESTRICTED scope `drive` (volledige Drive) wordt vervangen door het niet-
 * restricted `drive.file` (alleen door-de-app-aangemaakte of -geopende bestanden).
 * Dat verbiedt twee dingen die de code voorheen deed:
 *   1. DriveApp.getRootFolder()      — de Drive-root is niet toegankelijk.
 *   2. DriveApp.getFoldersByName(..) — whole-Drive zoeken is niet toegestaan.
 * Mappen worden nu geresolved via opgeslagen ID's (drive.file-veilig) of parent-
 * loos aangemaakt. Deze guard voorkomt regressie naar de niet-toegestane calls.
 *
 * NB: drive.file-PERMISSIES zijn hier niet afdwingbaar (mocks). Deze test borgt
 * alleen het code-patroon; echte validatie gebeurt op het dev-script.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../src');

// Crude maar afdoende: strip block- en line-comments zodat de doc-/uitleg-
// teksten (die getRootFolder/getFoldersByName noemen) niet als overtreding tellen.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('#4 stap 2 — drive.file-veilige Drive-toegang', () => {
  const gsFiles = fs.readdirSync(SRC).filter((f) => f.endsWith('.gs'));
  const code = {};
  gsFiles.forEach((f) => {
    code[f] = stripComments(fs.readFileSync(path.join(SRC, f), 'utf8'));
  });

  test('geen enkele DriveApp.getRootFolder()-call (Drive-root is onbereikbaar onder drive.file)', () => {
    const overtreders = gsFiles.filter((f) => /DriveApp\.getRootFolder\s*\(/.test(code[f]));
    expect(overtreders).toEqual([]);
  });

  test('DriveApp.getFoldersByName (whole-Drive zoeken) enkel nog in de defensieve collision-detectie', () => {
    const overtreders = gsFiles.filter(
      (f) => f !== 'DriveStructuur.gs' && /DriveApp\.getFoldersByName\s*\(/.test(code[f])
    );
    expect(overtreders).toEqual([]);
  });

  test('centrale drive.file-veilige resolvers bestaan in DriveStructuur', () => {
    const ds = code['DriveStructuur.gs'];
    expect(ds).toMatch(/function getDriveHoofdmap_\(/);
    expect(ds).toMatch(/function getDriveBackupMap_\(/);
    expect(ds).toMatch(/function getOfMaakLosseMap_\(/);
  });
});
