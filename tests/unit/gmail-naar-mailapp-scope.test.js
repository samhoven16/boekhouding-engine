/**
 * tests/unit/gmail-naar-mailapp-scope.test.js
 *
 * #4 Google-scope-minimalisatie, stap 1 — Gmail → MailApp.
 * GmailApp.sendEmail vereist de RESTRICTED scope gmail.send (duur, CASA-
 * security-assessment bij Google-verificatie). Alle verzendcode is omgezet naar
 * MailApp.sendEmail, dat de NIET-restricted scope script.send_mail gebruikt; de
 * enige niet-send Gmail-call (getAliases in Diagnostiek) is verwijderd.
 *
 * Deze guard borgt dat niemand GmailApp herintroduceert — dat zou stilletjes de
 * gmail.send-scope terugeisen en de verificatie weer naar het dure traject duwen
 * (én at-runtime falen zolang de scope niet in het manifest staat).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../src');

describe('#4 stap 1 — gmail.send-scope verwijderd', () => {
  const gsFiles = fs.readdirSync(SRC).filter((f) => f.endsWith('.gs'));

  test('geen enkel src-bestand gebruikt nog GmailApp.* (zou breken zonder gmail-scope)', () => {
    const overtreders = [];
    for (const f of gsFiles) {
      const inhoud = fs.readFileSync(path.join(SRC, f), 'utf8');
      const treffers = inhoud.match(/GmailApp\.\w+/g);
      if (treffers) overtreders.push(`${f}: ${[...new Set(treffers)].join(', ')}`);
    }
    expect(overtreders).toEqual([]);
  });

  test('manifest declareert script.send_mail en niet langer de restricted gmail.send', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(SRC, 'appsscript.json'), 'utf8'));
    expect(manifest.oauthScopes).toContain('https://www.googleapis.com/auth/script.send_mail');
    expect(manifest.oauthScopes).not.toContain('https://www.googleapis.com/auth/gmail.send');
  });
});
