/**
 * tests/unit/cycle4-html-escape-branding.test.js
 *
 * Axiom 14 + 15: HTML escaped, geen trust op input.
 *
 * Branding.gs:logoGekozen leest een file en injecteert dataUrl in
 * innerHTML. SVG-bestanden (MIME image/svg+xml) zouden via input
 * accept="image/*" door de filter komen en script-tags kunnen
 * bevatten. Fix: hard MIME-whitelist + regex-sanity op dataUrl format.
 *
 * Test alleen via broncode-check — file-upload kan niet in jest worden
 * gesimuleerd zonder DOM.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const BRAND_GS = path.resolve(__dirname, '../../src/Branding.gs');

describe('CYCLE 4: Branding.gs logo-upload MIME-whitelist', () => {
  const src = fs.readFileSync(BRAND_GS, 'utf8');

  test('toegestaneMimes-whitelist staat in logoGekozen', () => {
    expect(src).toMatch(/toegestaneMimes/);
    // Whitelist bevat PNG/JPEG/JPG/GIF/WebP
    expect(src).toMatch(/image\/png/);
    expect(src).toMatch(/image\/jpeg/);
    expect(src).toMatch(/image\/gif/);
    expect(src).toMatch(/image\/webp/);
  });

  test('SVG is NIET in whitelist (kern XSS-vector)', () => {
    // Whitelist-array mag image/svg+xml niet bevatten
    const m = src.match(/toegestaneMimes\s*=\s*\[([^\]]+)\]/);
    expect(m).toBeTruthy();
    expect(m[1]).not.toMatch(/svg/i);
  });

  test('indexOf(fileMime) === -1 check aanwezig (reject niet-whitelist)', () => {
    expect(src).toMatch(/toegestaneMimes\.indexOf\(fileMime\)\s*===\s*-1/);
  });

  test('Sanity-regex op dataUrl-format (defense vs file.type-spoofing)', () => {
    // Source-string bevat regex die alleen raster-image data-URL accepteert
    expect(src).toContain('data:image\\/(png|jpeg|jpg|gif|webp)');
    expect(src).toContain('base64,');
  });

  test('Alert-melding bij niet-toegestaan MIME (klant ziet uitleg)', () => {
    expect(src).toMatch(/Bestandstype niet ondersteund/);
  });

  test('Input-veld wordt gereset bij rejection (geen residuele state)', () => {
    expect(src).toMatch(/input\.value\s*=\s*['"]['"]/);
  });
});
