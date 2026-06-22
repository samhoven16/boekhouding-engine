# Runbook — standby licentieserver + uptime-monitoring (blokker #2, F-SCALE-141)

> **Doel**: de operationele 100%-blokker afvinkbaar maken. De licentieserver is
> nu een ongerepliceerde SPOF: valt-ie langer dan de 90-daagse offline-grace uit,
> dan ligt de hele betalende basis eruit. De **code-helft staat** (clients
> proberen `LICENTIE_SERVER_URL_FALLBACK` vóór ze op offline-grace vallen); dit
> zijn de **operationele stappen** voor Sam.

## ⚠️ Kritieke veiligheidsregel vóór alles (N-M1-1)
De standby MOET op **dezelfde licentie-spreadsheet** wijzen (`LICENTIE_SHEET_ID`
= exact dezelfde sheet-ID als de primaire). Een standby met een lege/verkeerde
`LICENTIE_SHEET_ID` geeft voor **élke** sleutel `geldig:false / niet gevonden`
terug. Sinds de N-M1-1-fix wist dat het grace-anker **niet** meer base-breed
(daarom is `permanent:true` van "niet gevonden" gehaald) — maar zo'n standby
valideert wél iederéén weg zolang clients 'm raken. **Controleer na deploy dat
`?actie=health` van de standby exact dezelfde `licenses`-telling geeft als de
primaire.** Wijkt die af → standby wijst naar de verkeerde/lege sheet → meteen
terugtrekken.

## Stap 1 — Standby deployen (tweede Apps Script web-app)
1. Maak een **tweede Apps Script-project** (of een tweede deployment van
   hetzelfde project) met **dezelfde `licence-server/Code.gs`** code.
2. Zet in **Project Settings → Script Properties** dezelfde kritieke props als de
   primaire — minimaal: `LICENTIE_SHEET_ID` (zelfde sheet!), `MOLLIE_API_KEY`,
   `BREVO_API_KEY`, `BREVO_WEBHOOK_TOKEN`, `TEMPLATE_SS_ID`, `WEB_APP_EXEC_URL`
   (= de eigen /exec-URL van de standby). `controleerKritiekeConfig_` → moet
   `ok:true` geven, anders rapporteert `?actie=health` `status:'crit'`.
3. Deploy → **Manage deployments** → kopieer de **/exec**-URL (niet /dev).
4. **Verifieer**: open `https://<standby>/exec?actie=health`. Verwacht JSON met
   `status:"ok"` én `licenses` = dezelfde telling als de primaire health-call.

## Stap 2 — Clients de standby-URL geven
Clients lezen de standby uit ScriptProperty `LICENTIE_SERVER_URL_FALLBACK`
(`src/Licentie.gs`). **F-SCALE-141b is geïmplementeerd**: zet
`licentieServerUrlFallback` in de **centrale config-payload** (de JSON die het
`?actie=config`-endpoint teruggeeft). De client-config-refresh (`haalConfigOp_`,
draait o.a. op onOpen) synct die waarde via `_syncStandbyUrlUitConfig_` naar de
ScriptProperty — dus **óók de honderden al-gedeployde kopieën** krijgen de
standby, zonder per-kopie handwerk. Eén veld in de config, klaar.
- Nieuwe kopieën erven 'm sowieso (via dezelfde config-route).
- Cache: `haalConfigOp_` cachet 24u, dus de standby-URL is doorgaans al lokaal
  bekend vóór een primaire-uitval; tijdens een uitval levert de cache 'm alsnog.

## Stap 3 — Uptime-monitoring (beide servers)
Zet een externe monitor (UptimeRobot / Healthchecks.io / Cloudflare Worker-cron)
op **`?actie=health` van zowel primair als standby**, elke 1-5 min. Alert wanneer:
- HTTP ≠ 200, **of**
- JSON `status` ≠ `"ok"` (= `crit`: kritieke config mist → feitelijk down voor
  nieuwe verkoop), **of**
- `licenses` == 0 of wijkt af van de andere server (→ verkeerde sheet, zie de
  kritieke regel), **of**
- `mollie`/`brevo`/`templateReady` == false (deelfunctie down).

Stuur de alert naar een kanaal dat Sam écht ziet (de server pusht zelf al
throttled mail naar `OWNER_STATUS_EMAIL` bij fouten — de externe monitor is de
onafhankelijke tweede lijn voor wanneer de server zélf niet meer kan mailen).

## Afvink-criteria (dan is blokker #2 dicht)
- ☐ Standby gedeployed, `?actie=health` → `status:"ok"` + `licenses` == primair.
- ☐ `LICENTIE_SERVER_URL_FALLBACK` aantoonbaar actief op (nieuwe) clients; route
  voor bestaande clients geverifieerd of code-toevoeging gedaan.
- ☐ Externe uptime-monitor op beide /health, met de vier alert-condities.
- ☐ Eén keer een failover getest (primair tijdelijk uit → client valt op standby,
  niet op offline-grace) — dit raakt de echte UrlFetch-keten, niet te unit-testen.
- Daarna: F-SCALE-141 infra-helft in `audit-ledger.md` → GESLOTEN.
