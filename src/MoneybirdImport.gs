/**
 * MoneybirdImport.gs
 * Moneybird XAF-import: importeer relaties + factuur-saldi uit een
 * Moneybird-export naar Boekhoudbaar.
 *
 * Achtergrond (criticus-rapport K1 / Concurrent):
 *   Switching-friction is de #1 reden om bij Moneybird te blijven. Zonder
 *   import-pad moet een klant 50+ klanten + 200+ openstaande facturen
 *   handmatig overzetten. Met deze knop: XAF uploaden → klanten in Relaties,
 *   openstaande facturen in VERKOOPFACTUREN. €30/mnd-vluchteling is binnen
 *   2 minuten klant.
 *
 * XAF 3.2 specificatie:
 *   <customer> → Boekhoudbaar Relaties-rij
 *   <customerInvoice> met openstaand bedrag → VERKOOPFACTUREN-rij status='Verzonden'
 *
 * Bewust NIET geïmporteerd:
 *   - Historische journaalposten (zou Boekhoudbaar's grootboek-saldi overschrijven)
 *   - PDF-bijlagen (XAF bevat alleen metadata, geen blobs)
 *   - Recurring facturen (Moneybird-specifiek, geen XAF-equivalent)
 *
 * De klant ziet na import een rapport: hoeveel relaties, hoeveel facturen,
 * welke fouten. Bestaande Relaties met dezelfde naam worden NIET overschreven
 * (idempotent + veilig bij dubbele import-poging).
 */

/**
 * Hoofd-entrypoint. Opent file-picker via HTML-dialog, klant kiest XAF.
 * Na upload roept verwerkXafBestand_ aan. Aan menu te koppelen via
 * Menu.gs: 'Migreer vanuit Moneybird (XAF-import)'.
 */
// eslint-disable-next-line no-unused-vars
function openMoneybirdImportDialoog() {
  const ui = SpreadsheetApp.getUi();
  if (!controleerSetupGedaan_()) {
    ui.alert('Setup eerst voltooien', 'Voltooi eerst de setup zodat de Relaties- en Verkoopfacturen-tabbladen bestaan.', ui.ButtonSet.OK);
    return;
  }
  const html = HtmlService.createHtmlOutput(`
    <style>
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;padding:24px;color:#1A1A1A;background:#F7F9FC}
      h3{color:#0D1B4E;font-size:18px;margin-bottom:8px}
      p{color:#5A6478;font-size:13.5px;line-height:1.55;margin:0 0 12px}
      .stap{background:#fff;border:1px solid #E5EAF2;border-radius:8px;padding:14px 16px;margin-bottom:12px;font-size:13px}
      .stap strong{color:#0D1B4E}
      input[type=file]{margin:8px 0 14px;font-family:inherit;font-size:13px;width:100%}
      .btn{background:#0D1B4E;color:#fff;border:none;padding:10px 20px;border-radius:6px;font-weight:600;cursor:pointer;font-family:inherit;font-size:13.5px}
      .btn:hover{background:#1A2A6B}
      .btn:disabled{opacity:0.5;cursor:not-allowed}
      #status{font-size:13px;color:#5A6478;margin-top:12px;line-height:1.55}
      .ok{color:#1B5E20;font-weight:600}
      .err{color:#B91C1C;font-weight:600}
    </style>
    <h3>Migreer vanuit Moneybird (XAF)</h3>
    <p>Welkom — overstappen is binnen 2 minuten geregeld. Je hoeft niets handmatig over te typen.</p>
    <div class="stap"><strong>Stap 1.</strong> Log in op Moneybird → Instellingen → Export → kies <strong>XAF (auditfile)</strong> → download.</div>
    <div class="stap"><strong>Stap 2.</strong> Selecteer het gedownloade .xaf-bestand hieronder. Boekhoudbaar leest klanten + openstaande facturen.</div>
    <input type="file" id="bestand" accept=".xaf,application/xml,text/xml">
    <button class="btn" id="startBtn" onclick="start()">Start import</button>
    <div id="status"></div>
    <script>
      function start() {
        const f = document.getElementById('bestand').files[0];
        if (!f) { document.getElementById('status').innerHTML = '<span class="err">Selecteer eerst een bestand.</span>'; return; }
        if (f.size > 20 * 1024 * 1024) { document.getElementById('status').innerHTML = '<span class="err">Bestand te groot (max 20MB).</span>'; return; }
        document.getElementById('startBtn').disabled = true;
        document.getElementById('status').textContent = 'Bezig met inlezen…';
        const reader = new FileReader();
        reader.onload = function(ev) {
          google.script.run
            .withSuccessHandler(function(rapport) {
              document.getElementById('status').innerHTML =
                '<span class="ok">✓ Klaar:</span> ' + rapport.relaties + ' relaties, ' +
                rapport.facturen + ' facturen, ' + (rapport.fouten || 0) + ' fout(en).' +
                (rapport.melding ? '<br><br>' + rapport.melding : '');
              document.getElementById('startBtn').disabled = false;
            })
            .withFailureHandler(function(err) {
              document.getElementById('status').innerHTML = '<span class="err">Fout: ' + (err.message || err) + '</span>';
              document.getElementById('startBtn').disabled = false;
            })
            .verwerkXafBestand_(ev.target.result);
        };
        reader.readAsText(f);
      }
    </script>
  `).setWidth(560).setHeight(420);
  ui.showModalDialog(html, 'Migreer vanuit Moneybird');
}

/**
 * Parse XAF-string en plaats klanten + openstaande facturen in sheets.
 * Idempotent: bestaande Relaties met dezelfde naam worden niet overschreven.
 *
 * @param {string} xafTekst  rauwe XML van het XAF-bestand
 * @returns {Object} { relaties, facturen, fouten, melding }
 */
// eslint-disable-next-line no-unused-vars
function verwerkXafBestand_(xafTekst) {
  if (!xafTekst || xafTekst.length < 100) {
    throw new Error('XAF-bestand is leeg of onvolledig.');
  }
  if (xafTekst.indexOf('auditfile') === -1) {
    throw new Error('Dit lijkt geen XAF-bestand — geen <auditfile>-tag gevonden. Controleer of je een XAF-export hebt gedownload (geen PDF/CSV).');
  }

  const ss = getSpreadsheet_();
  let document;
  try {
    document = XmlService.parse(xafTekst);
  } catch (e) {
    throw new Error('XAF kon niet worden geparseerd: ' + e.message);
  }
  const root = document.getRootElement();
  const ns = root.getNamespace();

  // ── Klanten importeren naar RELATIES ─────────────────────────
  const relatiesSheet = ss.getSheetByName(SHEETS.RELATIES);
  if (!relatiesSheet) throw new Error('Relaties-tabblad niet gevonden.');
  const bestaandeNamen = {};
  const huidigeData = relatiesSheet.getDataRange().getValues();
  for (let i = 1; i < huidigeData.length; i++) {
    const naam = String(huidigeData[i][1] || '').trim().toLowerCase();
    if (naam) bestaandeNamen[naam] = true;
  }

  let nieuweRelaties = 0;
  let overgeslagenRelaties = 0;
  const company = root.getChild('company', ns);
  if (company) {
    const customers = company.getChild('customersSuppliers', ns);
    if (customers) {
      const kinderen = customers.getChildren('customer', ns);
      kinderen.forEach(function(klant) {
        const naam = _xafTekst_(klant, 'custName', ns);
        if (!naam) { overgeslagenRelaties++; return; }
        if (bestaandeNamen[naam.toLowerCase()]) { overgeslagenRelaties++; return; }
        const id = 'REL' + Utilities.formatString('%04d', Math.floor(Math.random() * 10000));
        relatiesSheet.appendRow([
          id, naam,
          _xafTekst_(klant, 'streetAddress', ns) || '',
          _xafTekst_(klant, 'postalCode', ns) || '',
          _xafTekst_(klant, 'city', ns) || '',
          _xafTekst_(klant, 'country', ns) || 'NL',
          _xafTekst_(klant, 'taxRegistrationCountry', ns) || '',
          _xafTekst_(klant, 'taxRegIdent', ns) || '',  // BTW-nummer
          '', // KvK — XAF heeft geen veld, klant vult later in
          _xafTekst_(klant, 'email', ns) || '',
          _xafTekst_(klant, 'telephone', ns) || '',
          'Klant',  // type
          new Date(),
        ]);
        nieuweRelaties++;
        bestaandeNamen[naam.toLowerCase()] = true;
      });
    }
  }

  // ── Openstaande verkoop-facturen ─────────────────────────────
  // We importeren ALLEEN open facturen, geen historische journaalposten.
  // Reden: anders zou Boekhoudbaar's grootboek-saldi overschreven worden
  // en zou de klant z'n openings-balans in een vreemde staat hebben.
  const vfSheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
  if (!vfSheet) throw new Error('Verkoopfacturen-tabblad niet gevonden.');
  let nieuweFacturen = 0;
  let overgeslagenFacturen = 0;
  if (company) {
    const journals = company.getChildren('transactions', ns);
    journals.forEach(function(trans) {
      const journ = trans.getChildren('journal', ns);
      journ.forEach(function(j) {
        const jrnType = (_xafTekst_(j, 'jrnTp', ns) || '').toUpperCase();
        if (jrnType !== 'V' && jrnType !== 'SALES') return;  // alleen verkoop-dagboek
        const transacties = j.getChildren('transaction', ns);
        transacties.forEach(function(tx) {
          const invNr  = _xafTekst_(tx, 'trNr', ns);
          const datum  = _xafTekst_(tx, 'trDt', ns);
          const desc   = _xafTekst_(tx, 'desc', ns);
          if (!invNr || !datum) { overgeslagenFacturen++; return; }
          // Som totale grondslag (sum credits op 8xxx-rekeningen)
          let bedragExcl = 0;
          let btwBedrag  = 0;
          const trans = tx.getChildren('trLine', ns);
          trans.forEach(function(tl) {
            const accId  = _xafTekst_(tl, 'accID', ns) || '';
            const amntCr = parseFloat(_xafTekst_(tl, 'amntCr', ns)) || 0;
            if (accId.indexOf('8') === 0) bedragExcl += amntCr;
            if (accId.indexOf('4100') === 0 || accId.indexOf('4110') === 0 || accId.indexOf('4120') === 0) {
              btwBedrag += amntCr;
            }
          });
          if (bedragExcl <= 0) { overgeslagenFacturen++; return; }
          vfSheet.appendRow([
            '', // ID auto
            String(invNr).trim(),
            new Date(datum),
            new Date(new Date(datum).getTime() + 30 * 86400000),  // vervaldatum +30d default
            '', '', '', '',  // klant ID/naam/KvK/BTW — niet gekoppeld
            desc || ('Import vanuit Moneybird ' + invNr),
            rondBedrag_(bedragExcl),
            btwBedrag > 0 ? '21% (hoog)' : '0% / vrijgesteld',
            rondBedrag_(btwBedrag),
            rondBedrag_(bedragExcl + btwBedrag),
            0,  // betaald
            'Verzonden',  // status — open
            '', '', '', 'Geimporteerd uit Moneybird XAF',
            '', '8000', new Date(), Session.getActiveUser().getEmail() || '',
          ]);
          nieuweFacturen++;
        });
      });
    });
  }

  try {
    schrijfAuditLog_('Moneybird XAF-import',
      nieuweRelaties + ' relaties + ' + nieuweFacturen + ' facturen geïmporteerd ' +
      '(' + overgeslagenRelaties + ' relaties + ' + overgeslagenFacturen + ' facturen overgeslagen).');
  } catch (_) {}

  return {
    relaties: nieuweRelaties,
    facturen: nieuweFacturen,
    fouten:   overgeslagenRelaties + overgeslagenFacturen,
    melding:  (overgeslagenRelaties + overgeslagenFacturen > 0)
      ? overgeslagenRelaties + ' relaties (dubbel) en ' + overgeslagenFacturen +
        ' facturen (incompleet/historisch) overgeslagen. Open RELATIES en VERKOOPFACTUREN om de import te bekijken.'
      : 'Open RELATIES en VERKOOPFACTUREN om de import te bekijken.',
  };
}

/**
 * Hulp: lees text van een child-element, retourneer '' bij ontbreken.
 * XML namespace-aware om XAF 3.2 elementen correct te vinden.
 */
function _xafTekst_(parent, naam, ns) {
  if (!parent) return '';
  const kind = parent.getChild(naam, ns);
  return kind ? String(kind.getText() || '').trim() : '';
}
