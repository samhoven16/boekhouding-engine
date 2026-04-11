/**
 * API.gs
 * Webhook-interface voor externe integraties (Zapier, Make, n8n, custom AI-workflows).
 *
 * GEBRUIK:
 * 1. Publiceer het script als Web App (Uitvoeren als: Ik zelf, Toegang: Iedereen)
 * 2. Kopieer de Web App URL
 * 3. Configureer in Zapier/Make als "Webhook POST" met JSON body
 *
 * BEVEILIGING:
 * Stel een API-sleutel in via Instellingen: "Webhook API sleutel"
 * Stuur mee als header: X-API-Key of als query param ?apikey=...
 *
 * ENDPOINTS (POST naar Web App URL):
 *
 * Factuur aanmaken:
 *   { "actie": "factuur", "klantnaam": "...", "klantEmail": "...", ... }
 *
 * Kosten boeken:
 *   { "actie": "kosten", "leverancier": "...", "bedragExcl": 100, ... }
 *
 * Status opvragen (GET):
 *   GET /exec?actie=status&apikey=...
 */

// ─────────────────────────────────────────────
//  WEB APP: POST (voor Zapier, Make, n8n, AI-agents)
// ─────────────────────────────────────────────
function doPost(e) {
  try {
    // API-sleutel validatie
    const apiSleutel = getInstelling_('Webhook API sleutel');
    if (apiSleutel) {
      // Sleutel kan meegegeven worden via:
      //   URL query param:  ?apikey=...
      //   JSON body veld:   { "apikey": "..." }
      // NB: HTTP-headers zijn niet toegankelijk vanuit Apps Script Web Apps.
      const queryKey = (e && e.parameter && e.parameter.apikey) || '';
      const bodyKey  = (e.postData && e.postData.contents &&
                        safeJsonParse_(e.postData.contents)['apikey']) || '';
      const meegezonden = queryKey || bodyKey;
      if (meegezonden !== apiSleutel) {
        return jsonResponse_({ succes: false, fout: 'Ongeldige of ontbrekende API-sleutel' });
      }
    }

    let payload = {};
    if (e.postData && e.postData.contents) {
      payload = safeJsonParse_(e.postData.contents);
    } else if (e.parameter) {
      payload = e.parameter;
    }

    const actie = String(payload.actie || '').toLowerCase();
    const ss = getSpreadsheet_();

    switch (actie) {
      case 'factuur':
      case 'inkomsten':
        return verwerkFactuurWebhook_(ss, payload);

      case 'kosten':
      case 'uitgaven':
        return verwerkKostenWebhook_(ss, payload);

      case 'declaratie':
        return verwerkDeclaratieWebhook_(ss, payload);

      case 'status':
        return statusResponse_(ss);

      case 'klant_opslaan':
        return slaKlantOpViaApi_(ss, payload);

      default:
        return jsonResponse_({
          succes: false,
          fout: `Onbekend verzoek: "${actie}". Geldige waarden: factuur, kosten, declaratie, status, klant_opslaan`,
        });
    }
  } catch (err) {
    Logger.log('doPost fout: ' + err.message);
    return jsonResponse_({ succes: false, fout: err.message });
  }
}

// ─────────────────────────────────────────────
//  WEB APP: GET (status check, Zapier trigger test, EN installer)
//
//  NB: Een GAS-project heeft slechts één doGet. Deze functie handelt
//  twee rollen af:
//   - ?sleutel=BKHE-... → installatieformulier (HTML, voor browser)
//   - overige requests  → JSON API (voor Zapier, Make, status)
// ─────────────────────────────────────────────
function doGet(e) {
  // Installer-flow: als ?sleutel= aanwezig is (ook leeg voor formulier)
  if (e && e.parameter && ('sleutel' in e.parameter)) {
    const sleutel = String(e.parameter.sleutel || '').trim().toUpperCase();
    return HtmlService.createHtmlOutput(bouwInstallerPagina_(sleutel))
      .setTitle('Boekhouding Engine — Installatie')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // API-flow: JSON response
  const apiSleutel = getInstelling_('Webhook API sleutel');
  if (apiSleutel) {
    const meegezonden = (e && e.parameter && e.parameter.apikey) || '';
    if (meegezonden !== apiSleutel) {
      return jsonResponse_({ succes: false, fout: 'Ongeldige of ontbrekende API-sleutel' });
    }
  }

  const actie = e && e.parameter ? String(e.parameter.actie || 'status') : 'status';
  const ss = getSpreadsheet_();

  if (actie === 'status') return statusResponse_(ss);

  if (actie === 'klanten') {
    const sheet = ss.getSheetByName(SHEETS.RELATIES);
    const data = sheet.getDataRange().getValues();
    const klanten = data.slice(1)
      .filter(r => r[0] && String(r[1]).includes('Klant'))
      .map(r => ({ id: r[0], naam: r[2], email: r[10], plaats: r[6] }));
    return jsonResponse_({ succes: true, klanten });
  }

  if (actie === 'facturen') {
    const sheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
    const data = sheet.getDataRange().getValues();
    const facturen = data.slice(1).filter(r => r[0]).slice(-20).map(r => ({
      nr: r[1], datum: formatDatum_(r[2]), klant: r[5],
      bedrag: r[12], status: r[14],
    }));
    return jsonResponse_({ succes: true, facturen });
  }

  return jsonResponse_({
    succes: true,
    bericht: 'Boekhouding Engine API actief',
    acties: ['status', 'klanten', 'facturen'],
  });
}

// ─────────────────────────────────────────────
//  FACTUUR VIA WEBHOOK
// ─────────────────────────────────────────────
function verwerkFactuurWebhook_(ss, p) {
  if (!p.klantnaam) return jsonResponse_({ succes: false, fout: 'klantnaam is verplicht' });
  if (!p.omschrijving && !p.regel1_omschrijving) return jsonResponse_({ succes: false, fout: 'omschrijving of regel1_omschrijving is verplicht' });

  // Bouw data-object op compatibel met het formulierformaat
  const data = {
    'Klantnaam':                           p.klantnaam,
    'Klant e-mailadres':                   p.klantEmail || p.klant_email || '',
    'Factuuradres klant':                  p.klantAdres || p.klant_adres || '',
    'KvK-nummer klant':                    p.klantKvk  || '',
    'BTW-nummer klant':                    p.klantBtwNr || '',
    'Factuurdatum':                        p.datum || new Date().toISOString().slice(0, 10),
    'Betalingstermijn (dagen)':            String(p.betalingstermijn || '30'),
    'BTW tarief':                          p.btwTarief || '21% (hoog)',
    'Regel 1 – Omschrijving':             p.omschrijving || p.regel1_omschrijving || '',
    'Regel 1 – Aantal':                   String(p.aantal || p.regel1_aantal || 1),
    'Regel 1 – Prijs per eenheid (excl. BTW)': String(p.prijsPerEenheid || p.bedragExcl || p.regel1_prijs || 0),
    'Regel 2 – Omschrijving':             p.regel2_omschrijving || '',
    'Regel 2 – Aantal':                   String(p.regel2_aantal || ''),
    'Regel 2 – Prijs per eenheid (excl. BTW)': String(p.regel2_prijs || ''),
    'Korting (in €)':                      String(p.korting || ''),
    'Factuur direct e-mailen naar klant?': p.directMailen === false ? 'Nee, later handmatig' : 'Ja, direct versturen',
    'Projectcode / Referentie':            p.projectcode || p.referentie || '',
    'Notities op factuur':                 p.notities || '',
    'Wat wil je doen?':                    'Inkomsten (factuur maken)',
  };

  try {
    verwerkInkomstenUitHoofdformulier_(ss, data);
    const factuurNr = parseInt(PropertiesService.getScriptProperties()
      .getProperty(PROP.VOLGEND_FACTUUR_NR) || '1') - 1;
    const prefix = getInstelling_('Factuurprefix') || 'F';
    return jsonResponse_({
      succes: true,
      bericht: 'Factuur aangemaakt',
      factuurnummer: formatFactuurnummer_(factuurNr, prefix, 6),
    });
  } catch (err) {
    return jsonResponse_({ succes: false, fout: err.message });
  }
}

// ─────────────────────────────────────────────
//  KOSTEN VIA WEBHOOK
// ─────────────────────────────────────────────
function verwerkKostenWebhook_(ss, p) {
  if (!p.leverancier) return jsonResponse_({ succes: false, fout: 'leverancier is verplicht' });
  if (!p.bedragExcl) return jsonResponse_({ succes: false, fout: 'bedragExcl is verplicht' });

  const data = {
    'Leveranciernaam':          p.leverancier,
    'Factuurnummer leverancier': p.factuurNr || p.factuurReferentie || 'WEBHOOK-' + Date.now(),
    'Factuurdatum uitgave':     p.datum || new Date().toISOString().slice(0, 10),
    'Bedrag excl. BTW':         String(p.bedragExcl),
    'BTW tarief uitgave':       p.btwTarief || '21% (hoog)',
    'BTW bedrag uitgave':       String(p.btwBedrag || ''),
    'Categorie kosten':         p.categorie || 'Overige kosten',
    'Betaalmethode':            p.betaalmethode || 'Overschrijving',
    'Betalingsstatus uitgave':  p.betaald ? 'Betaald' : 'Openstaand',
    'Omschrijving uitgave':     p.omschrijving || p.categorie || 'Webhookboeking',
    'Notities uitgave':         p.notities || '',
  };

  try {
    verwerkUitgavenUitHoofdformulier_(ss, data);
    return jsonResponse_({ succes: true, bericht: 'Kosten geboekt' });
  } catch (err) {
    return jsonResponse_({ succes: false, fout: err.message });
  }
}

// ─────────────────────────────────────────────
//  DECLARATIE VIA WEBHOOK
// ─────────────────────────────────────────────
function verwerkDeclaratieWebhook_(ss, p) {
  const data = {
    'Datum declaratie':           p.datum || new Date().toISOString().slice(0, 10),
    'Categorie declaratie':       p.categorie || 'Overige kosten',
    'Bedrag excl. BTW declaratie': String(p.bedragExcl || 0),
    'BTW tarief declaratie':      p.btwTarief || '0% (nultarief)',
    'Betaalmethode declaratie':   p.betaalmethode || 'Privé bankpas / creditcard',
    'Omschrijving declaratie':    p.omschrijving || 'Declaratie via webhook',
    'Betaald door (naam)':        p.betaaldDoor || '',
    'Declaratie status':          p.terugbetaald ? 'Terugbetaald' : 'Terug te betalen',
  };

  try {
    verwerkDeclaratieUitHoofdformulier_(ss, data);
    return jsonResponse_({ succes: true, bericht: 'Declaratie geboekt' });
  } catch (err) {
    return jsonResponse_({ succes: false, fout: err.message });
  }
}

// ─────────────────────────────────────────────
//  KLANT OPSLAAN VIA API
// ─────────────────────────────────────────────
function slaKlantOpViaApi_(ss, p) {
  if (!p.naam) return jsonResponse_({ succes: false, fout: 'naam is verplicht' });
  const id = zoekOfMaakRelatie_(ss, p.naam, RELATIE_TYPE.KLANT, p.email || '');
  return jsonResponse_({ succes: true, relatieId: id, bericht: 'Klant opgeslagen' });
}

// ─────────────────────────────────────────────
//  STATUS RESPONSE
// ─────────────────────────────────────────────
function statusResponse_(ss) {
  // Fast path: API status calls are high-frequency; snapshot avoids 4 sheet reads.
  // vernieuwDashboard() (runs daily + on every form submit) keeps the snapshot fresh.
  const kpi = leesKpiSnapshot_() || berekenKpiData_(ss);
  return jsonResponse_({
    succes: true,
    status: 'actief',
    bedrijf: getInstelling_('Bedrijfsnaam') || '',
    omzetYTD: kpi.omzet,
    nettowinst: kpi.nettowinst,
    openDebiteuren: kpi.debiteurenOpen,
    btwSaldo: kpi.btwSaldo,
    tijdstip: new Date().toISOString(),
  });
}

// ─────────────────────────────────────────────
//  ZAPIER INSTRUCTIES TONEN
// ─────────────────────────────────────────────
function toonZapierInstructies() {
  const ui = SpreadsheetApp.getUi();
  const html = HtmlService.createHtmlOutput(`
    <style>
      body{font-family:Arial,sans-serif;padding:20px;font-size:13px}
      h3{color:#1A237E}
      code{background:#F5F5F5;padding:2px 6px;border-radius:3px;font-size:12px}
      pre{background:#F5F5F5;padding:12px;border-radius:4px;overflow:auto;font-size:11px}
      .stap{background:#E8EAF6;padding:10px;border-radius:4px;margin:8px 0}
      .tip{background:#FFF8E1;padding:8px;border-radius:4px;font-size:11px}
    </style>
    <h3>Koppelen met andere programma's</h3>
    <p>U kunt uw boekhouding automatisch laten bijwerken vanuit andere programma's zoals Zapier, Make of n8n.</p>

    <div class="stap"><b>Stap 1:</b> Publiceer uw script als Web App<br>
    Open de Apps Script editor → klik op <b>Implementeren → Nieuwe implementatie → Web App</b><br>
    Kies: Uitvoeren als <b>"Ik zelf"</b> en Toegang <b>"Iedereen"</b><br>
    Kopieer de URL die verschijnt</div>

    <div class="stap"><b>Stap 2 (aanbevolen):</b> Stel een beveiligingscode in<br>
    Ga naar het tabblad <b>Instellingen</b> en vul een wachtwoord in bij <code>Webhook API sleutel</code>.<br>
    Dit voorkomt dat anderen uw boekhouding kunnen aanpassen.</div>

    <div class="stap"><b>Stap 3:</b> Stel Zapier / Make in<br>
    Kies als actie: <b>Webhooks → POST</b><br>
    Plak de Web App URL<br>
    Body type: <b>JSON</b></div>

    <p><b>Voorbeeld: automatisch een factuur aanmaken</b></p>
    <pre>{
  "actie": "factuur",
  "klantnaam": "Bedrijf BV",
  "klantEmail": "klant@bedrijf.nl",
  "omschrijving": "Consultancy januari",
  "aantal": 8,
  "prijsPerEenheid": 95,
  "btwTarief": "21% (hoog)",
  "directMailen": true
}</pre>

    <p><b>Voorbeeld: kosten automatisch boeken</b></p>
    <pre>{
  "actie": "kosten",
  "leverancier": "Adobe Systems",
  "bedragExcl": 49.99,
  "btwTarief": "21% (hoog)",
  "categorie": "Software & Abonnementen",
  "omschrijving": "Adobe CC abonnement"
}</pre>

    <div class="tip"><b>Geavanceerd:</b> U kunt ook een AI-tool (bijv. Claude of ChatGPT) automatisch bonnetjes laten verwerken en naar uw boekhouding sturen via deze koppeling.</div>
  `).setWidth(600).setHeight(520);
  ui.showModalDialog(html, 'Koppelen met andere programma\'s');
}

// ─────────────────────────────────────────────
//  JSON HELPERS
// ─────────────────────────────────────────────
function jsonResponse_(data, statusCode) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function safeJsonParse_(str) {
  try { return JSON.parse(str) || {}; }
  catch (e) { return {}; }
}
