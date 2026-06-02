/**
 * Referral.gs
 * Refer-a-friend dialog — klant deelt persoonlijke verwijslink + krijgt €5
 * korting bij volgende factuur of cadeaubon. Verwezen vriend krijgt ook €5
 * korting op aankoop (€44 i.p.v. €49).
 *
 * Geen server-side tracking-infrastructuur nodig: klant deelt link met
 * UTM-parameter (?ref=<email-hash>); bij checkout op website ziet klant
 * "verwezen door"-veld; eens per maand controleren we handmatig en
 * verzenden cadeaubon naar verwijzer.
 *
 * Waarom: eenmalig €49 product = lage marge per klant, maar mond-op-mond
 * is gratis kanaal. €5+€5 cashback maakt het de moeite waard om actief
 * te delen.
 */

function toonReferralDialog() {
  if (!controleerSetupGedaan_()) return;
  const ui = (function() { try { return SpreadsheetApp.getUi(); } catch (_) { return null; } })();
  if (!ui) return;

  // Anonieme verwijscode op basis van user-email hash. Niet de email zelf
  // delen — dat is privacy-gevoelig.
  let userEmail = '';
  try { userEmail = Session.getActiveUser().getEmail() || ''; } catch (_) {}
  const refCode = userEmail
    ? Utilities.base64EncodeWebSafe(Utilities.computeDigest(
        Utilities.DigestAlgorithm.SHA_256, userEmail
      )).replace(/=+$/, '').slice(0, 10)
    : 'unknown';

  const verwijslink = 'https://www.boekhoudbaar.nl/?ref=' + refCode;
  const bedrijf = getInstelling_('Bedrijfsnaam') || 'een ZZP-collega';

  const whatsappTekst = encodeURIComponent(
    'Hé, ik gebruik Boekhoudbaar voor mijn ZZP-boekhouding — eenmalig €49, ' +
    'geen abonnement. Werkt in Google Sheets, alle data blijft van jou. ' +
    'Met deze link krijgen we beide €5 korting: ' + verwijslink
  );
  const emailTekst = encodeURIComponent(
    'Hé,\n\n' +
    'Ik gebruik Boekhoudbaar voor mijn boekhouding (' + bedrijf + ') en het ' +
    'bevalt zo goed dat ik het je wil aanraden. Het is een Google Sheets-' +
    'gebaseerde tool — eenmalig €49, geen abonnement, jouw data blijft in ' +
    'je eigen Drive.\n\n' +
    'Via deze link krijgen we allebei €5 korting (jij €44 i.p.v. €49, ik €5 ' +
    'cashback):\n' + verwijslink + '\n\n' +
    'Vragen? Vraag het me of mail support@boekhoudbaar.nl.\n\n' +
    'Groet'
  );
  const emailOnderwerp = encodeURIComponent('Tip: Boekhoudbaar — ZZP-boekhouding voor €49');
  const linkedinTekst = encodeURIComponent(
    'Voor ZZP\'ers die hun boekhouding zelf willen doen: Boekhoudbaar. ' +
    'Eenmalig €49 (geen abonnement), in Google Sheets, eigen data. ' +
    'Aanrader. ' + verwijslink
  );

  const html = HtmlService.createHtmlOutput(`
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
           background:linear-gradient(135deg,#F7F9FC 0%,#EAF4F2 100%);
           padding:28px 30px;color:#1A1A1A;-webkit-font-smoothing:antialiased}
      .label{font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#2EC4B6;margin-bottom:8px}
      h1{color:#0D1B4E;font-size:24px;font-weight:800;letter-spacing:-0.015em;margin-bottom:6px;line-height:1.25}
      p.sub{color:#5F6B7A;font-size:14px;line-height:1.6;margin-bottom:20px}
      .voordeel-kaart{background:#fff;border:1px solid #E5EAF2;border-left:3px solid #2EC4B6;border-radius:12px;padding:16px 18px;margin-bottom:20px;box-shadow:0 1px 3px rgba(13,27,78,.04)}
      .voordeel-kaart strong{display:block;color:#0D1B4E;font-size:13px;font-weight:700;margin-bottom:4px;letter-spacing:-0.005em}
      .voordeel-kaart span{font-size:13px;color:#5F6B7A;line-height:1.55}

      .link-rij{background:#fff;border:1px solid #E5EAF2;border-radius:10px;padding:10px 14px;margin-bottom:18px;display:flex;align-items:center;gap:10px}
      .link-rij input{flex:1;border:none;outline:none;font-family:inherit;font-size:13px;color:#0D1B4E;background:transparent;font-weight:500}
      .link-rij button{background:#0D1B4E;color:#fff;border:none;padding:8px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:background .15s}
      .link-rij button:hover{background:#1A2A6B}
      .link-rij button.ok{background:#1B5E20}

      .deel-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:18px}
      .deel-knop{background:#fff;border:1px solid #E5EAF2;border-radius:10px;padding:12px 14px;text-decoration:none;color:#0D1B4E;font-size:13px;font-weight:600;display:flex;align-items:center;gap:10px;transition:all .15s;font-family:inherit}
      .deel-knop:hover{border-color:#2EC4B6;background:#F7F9FC;transform:translateY(-1px)}
      .deel-knop .ic{font-size:18px}

      .uitleg{background:#FFF8E1;border:1px solid #FFECB3;border-radius:10px;padding:12px 14px;font-size:12px;color:#5A3F00;line-height:1.55;margin-top:14px}
      .uitleg strong{color:#3a2700}

      .sluit{background:none;border:1px solid #E5EAF2;color:#5F6B7A;padding:9px 16px;border-radius:8px;font-size:13px;cursor:pointer;font-family:inherit;width:100%;margin-top:14px}
      .sluit:hover{background:#F7F9FC;color:#0D1B4E}
    </style>

    <div class="label">🎁 Verwijs een vriend</div>
    <h1>Jullie krijgen beide €5</h1>
    <p class="sub">Een eenmalige aankoop heeft geen verkooppraat. Mond-op-mond reclame wel. Helpt het je vriend en jezelf.</p>

    <div class="voordeel-kaart">
      <strong>Voor je vriend (ZZP-collega)</strong>
      <span>€5 korting op Boekhoudbaar — €44 i.p.v. €49 via jouw link.</span>
    </div>
    <div class="voordeel-kaart">
      <strong>Voor jou</strong>
      <span>€5 cashback per succesvolle verwijzing — uitbetaald per IBAN of als bol.com cadeaubon (jouw keuze).</span>
    </div>

    <p style="font-size:12px;font-weight:700;color:#0D1B4E;margin-bottom:6px;letter-spacing:0.3px">JOUW PERSOONLIJKE LINK</p>
    <div class="link-rij">
      <input id="link" type="text" value="${verwijslink}" readonly>
      <button id="btn-kopieer" type="button" data-actie="kopieer">Kopieer</button>
    </div>

    <p style="font-size:12px;font-weight:700;color:#0D1B4E;margin-bottom:6px;letter-spacing:0.3px">DELEN VIA</p>
    <div class="deel-grid">
      <a class="deel-knop" target="_blank" rel="noopener" href="https://wa.me/?text=${whatsappTekst}">
        <span class="ic">💬</span> WhatsApp
      </a>
      <a class="deel-knop" target="_blank" rel="noopener" href="mailto:?subject=${emailOnderwerp}&body=${emailTekst}">
        <span class="ic">📧</span> E-mail
      </a>
      <a class="deel-knop" target="_blank" rel="noopener" href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(verwijslink)}">
        <span class="ic">💼</span> LinkedIn
      </a>
      <a class="deel-knop" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=${linkedinTekst}">
        <span class="ic">🐦</span> X / Twitter
      </a>
    </div>

    <div class="uitleg">
      <strong>Hoe werkt de cashback?</strong> Je vriend voert tijdens checkout je verwijscode (<code>${refCode}</code>) in,
      óf ze klikken jouw link en de code wordt automatisch toegepast. Eens per maand ontvang je een mail
      van support@boekhoudbaar.nl met je verdiende cashback. Geen formulieren, geen drempels.
    </div>

    <button class="sluit" type="button" data-actie="sluit">Sluiten</button>

    <script>
      var inputEl = document.getElementById('link');
      var kopBtn = document.getElementById('btn-kopieer');

      function kopieer() {
        try {
          inputEl.select();
          inputEl.setSelectionRange(0, 99999);
          // Modern API
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(inputEl.value).then(function() {
              kopBtn.textContent = '✓ Gekopieerd';
              kopBtn.classList.add('ok');
              setTimeout(function() {
                kopBtn.textContent = 'Kopieer';
                kopBtn.classList.remove('ok');
              }, 2000);
            });
          } else {
            // Fallback execCommand
            document.execCommand('copy');
            kopBtn.textContent = '✓ Gekopieerd';
            kopBtn.classList.add('ok');
          }
        } catch (e) {
          kopBtn.textContent = 'Selecteer & kopieer handmatig';
        }
      }

      // Bind alle data-actie knoppen
      document.querySelectorAll('[data-actie]').forEach(function(btn) {
        btn.addEventListener('click', function(ev) {
          var actie = btn.getAttribute('data-actie');
          if (actie === 'kopieer') { ev.preventDefault(); kopieer(); }
          else if (actie === 'sluit') {
            try { google.script.host.close(); } catch (_) {}
          }
        });
      });
    </script>
  `).setWidth(440).setHeight(640).setSandboxMode(HtmlService.SandboxMode.IFRAME);

  ui.showModalDialog(html, '🎁 Verwijs een vriend');

  // Audit-log voor support-tracking
  safeAuditLog_('Referral-dialog geopend', 'code=' + refCode);
}
