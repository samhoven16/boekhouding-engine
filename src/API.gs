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
//  WEB APP: GET (status check, Zapier trigger test)
//
//  Klantinstallatie loopt via de centrale licentieserver
//  (licence-server/Code.gs), niet via de klant-kopie zelf.
// ─────────────────────────────────────────────
function doGet(e) {
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
    bericht: 'Boekhoudbaar API actief',
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
  const apiSleutel = getInstelling_('Webhook API sleutel') || 'UW-API-SLEUTEL-HIER';
  const webAppUrl  = getInstelling_('Web App URL') || 'https://script.google.com/macros/s/XXXXXX/exec';

  const html = HtmlService.createHtmlOutput(`
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
           padding:20px;font-size:13px;color:#333;line-height:1.5}
      h3{color:#0D1B4E;font-size:16px;font-weight:700;letter-spacing:-0.01em;margin-bottom:4px}
      h4{color:#0D1B4E;margin:16px 0 6px;font-weight:600}
      p{margin-bottom:10px}
      code{background:#F5F5F5;padding:2px 6px;border-radius:3px;font-size:11px;
           font-family:monospace;word-break:break-all}
      pre{background:#1E1E1E;color:#D4D4D4;padding:14px;border-radius:6px;
          overflow:auto;font-size:11px;font-family:monospace;margin:6px 0 14px}
      .kw{color:#569CD6} .str{color:#CE9178} .prop{color:#9CDCFE}
      .num{color:#B5CEA8} .cmt{color:#6A9955}
      .stap{background:#fff;border:1px solid #E5EAF2;border-left:3px solid #0D1B4E;padding:10px 14px;
            border-radius:0 6px 6px 0;margin:10px 0}
      .ok{background:#E6F7F4;border-left:3px solid #2EC4B6;padding:10px 14px;
          border-radius:0 6px 6px 0;margin:10px 0}
      .url-box{background:#F7F9FC;border:1px solid #E5EAF2;padding:10px;border-radius:6px;word-break:break-all;
               font-family:monospace;font-size:11px;margin:6px 0}
      .badge{display:inline-block;background:#0D1B4E;color:white;border-radius:3px;
             padding:1px 7px;font-size:11px;font-weight:bold;margin-right:4px}
      hr{border:none;border-top:1px solid #eee;margin:16px 0}
    </style>

    <h3>🔗 Website koppelen aan uw boekhouding</h3>
    <p style="color:#555">Uw boekhouding heeft een ingebouwde API. Elke website of webshop
    kan er direct mee communiceren — <b>geen Zapier, geen abonnement, geen kosten</b>.</p>

    <div class="stap">
      <b>Stap 1 — Publiceer de Web App (eenmalig)</b><br>
      Open <b>Extensies → Apps Script</b> → klik rechtsboven op <b>Implementeren → Nieuwe implementatie</b><br>
      Type: <b>Web-app</b> &nbsp;|&nbsp; Uitvoeren als: <b>Ik zelf</b> &nbsp;|&nbsp; Toegang: <b>Iedereen</b><br>
      Kopieer de URL en plak deze in het Instellingen-tabblad bij <code>Web App URL</code>.
    </div>

    <div class="ok">
      <b>Uw huidige Web App URL:</b><br>
      <div class="url-box">${webAppUrl}</div>
      ${webAppUrl.includes('XXXXXX') ? '<span style="color:#c62828">⚠ Nog niet ingesteld — voer stap 1 uit</span>' : '<span style="color:#2E7D32">✓ Klaar voor gebruik</span>'}
    </div>

    <hr>
    <h4>Factuur boeken vanuit uw website</h4>
    <p>Plak dit in de JavaScript van uw website (bijv. bij een betaalbevestiging of contactformulier):</p>
    <pre><span class="cmt">// Na een aankoop op uw website:</span>
<span class="kw">fetch</span>(<span class="str">'${webAppUrl}'</span>, {
  <span class="prop">method</span>: <span class="str">'POST'</span>,
  <span class="prop">headers</span>: { <span class="str">'Content-Type'</span>: <span class="str">'application/json'</span> },
  <span class="prop">body</span>: <span class="kw">JSON.stringify</span>({
    <span class="prop">actie</span>:          <span class="str">'factuur'</span>,
    <span class="prop">apikey</span>:         <span class="str">'${apiSleutel}'</span>,
    <span class="prop">klantnaam</span>:      <span class="str">'Jan Jansen'</span>,       <span class="cmt">// uit uw bestelformulier</span>
    <span class="prop">klantEmail</span>:     <span class="str">'jan@voorbeeld.nl'</span>,
    <span class="prop">omschrijving</span>:   <span class="str">'Aankoop product XYZ'</span>,
    <span class="prop">aantal</span>:         <span class="num">1</span>,
    <span class="prop">prijsPerEenheid</span>: <span class="num">99.00</span>,             <span class="cmt">// excl. BTW</span>
    <span class="prop">btwTarief</span>:      <span class="str">'21% (hoog)'</span>,
    <span class="prop">directMailen</span>:   <span class="kw">true</span>                <span class="cmt">// factuur direct naar klant</span>
  })
})
.<span class="kw">then</span>(r =&gt; r.<span class="kw">json</span>())
.<span class="kw">then</span>(res =&gt; console.<span class="kw">log</span>(res)); <span class="cmt">// { succes: true, factuurnummer: "F2026001" }</span></pre>

    <h4>Kosten boeken (bijv. automatische abonnementen)</h4>
    <pre><span class="kw">fetch</span>(<span class="str">'${webAppUrl}'</span>, {
  <span class="prop">method</span>: <span class="str">'POST'</span>,
  <span class="prop">headers</span>: { <span class="str">'Content-Type'</span>: <span class="str">'application/json'</span> },
  <span class="prop">body</span>: <span class="kw">JSON.stringify</span>({
    <span class="prop">actie</span>:       <span class="str">'kosten'</span>,
    <span class="prop">apikey</span>:      <span class="str">'${apiSleutel}'</span>,
    <span class="prop">leverancier</span>: <span class="str">'Shopify'</span>,
    <span class="prop">bedragExcl</span>:  <span class="num">24.17</span>,
    <span class="prop">btwTarief</span>:   <span class="str">'21% (hoog)'</span>,
    <span class="prop">categorie</span>:   <span class="str">'Software &amp; Abonnementen'</span>
  })
});</pre>

    <hr>
    <h4>Beschikbare acties</h4>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <tr style="background:#0D1B4E;color:white">
        <th style="padding:8px;text-align:left">actie</th>
        <th style="padding:8px;text-align:left">Wat het doet</th>
      </tr>
      <tr><td style="padding:5px"><code>factuur</code></td><td style="padding:5px">Verkoopfactuur aanmaken + PDF + e-mail naar klant</td></tr>
      <tr style="background:#fafafa"><td style="padding:5px"><code>kosten</code></td><td style="padding:5px">Inkoopfactuur / kosten boeken</td></tr>
      <tr><td style="padding:5px"><code>declaratie</code></td><td style="padding:5px">Declaratie registreren</td></tr>
      <tr style="background:#fafafa"><td style="padding:5px"><code>status</code> (GET)</td><td style="padding:5px">Omzet, BTW-saldo, openstaande facturen ophalen</td></tr>
      <tr><td style="padding:5px"><code>klant_opslaan</code></td><td style="padding:5px">Klant toevoegen aan relatiebestand</td></tr>
    </table>

    <p style="font-size:11px;color:#888;margin-top:16px">
      <b>Zapier / Make / n8n?</b> Werkt ook — gebruik Webhooks → POST met dezelfde JSON-structuur.
    </p>
  `).setWidth(680).setHeight(620);
  ui.showModalDialog(html, 'Website koppelen aan uw boekhouding');
}

// ─────────────────────────────────────────────
//  JSON HELPERS
// ─────────────────────────────────────────────
function jsonResponse_(data, _statusCode) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function safeJsonParse_(str) {
  try { return JSON.parse(str) || {}; }
  catch (_e) { return {}; }
}
