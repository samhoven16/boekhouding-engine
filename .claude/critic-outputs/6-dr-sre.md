I have enough material to deliver. Synthesizing now.

---

# Disaster-readiness Assessment — BoekHoudbaar @ 23:47

## Architectuur in 30s
Per-klant Apps Script bound aan eigen Sheet. **Er is geen centrale prod** — "BoekHoudbaar prod down voor 2.000 klanten" kán alleen via 4 single-points-of-failure: (1) `LICENTIE_SERVER_URL` (cycle 82 grace = 7d), (2) Mollie API, (3) Gmail/MailApp dagquotum, (4) onbedoelde mass-push van een breaking GAS-versie via `deploy.yml`. Healthchecks.io heartbeat zit alleen op `dagelijkseTaken` van Sam's eigen sheet — niet per klant.

## Top 5 disaster-scenarios (waarschijnlijkheid × impact)

**1. License-server stuk > 7 dagen, of foute revoke-deploy** (Licentie.gs:847 `_offlineFallback_`)
Bij ≥7d geen succesvolle response → `geldig:false` → klanten zijn locked-out. Eén kapotte `valideer`-endpoint die `{geldig:false}` returneert wist alle klant-cache binnen 24u (`isLicentieGeldig_` line 587–610). Cron-monitor (`health-monitor.yml` line 61) detecteert HTTP-down, **maar niet "200 OK met logica-bug die iedereen invalideert"**. Detectie: ~5 min (Gmail van GitHub Actions fail). Blast: 100% klanten binnen 24h. Recovery: rollback license-server + `LICENTIE_CACHE_KEY` overleeft. MTTR: 30–90 min mits Sam wakker.

**2. Gmail-quotum-exhaustion bij dunning-storm** (Triggers.gs:1958–2077)
Pre-flight stopt bij <5 (line 1969), maar quotum is **per consumer-account 100/dag**. Sam's bound script gebruikt KLANT-account-quotum — dus 1 klant met 95 vervallen facturen blokkeert zichzelf, **niet alle klanten**. Echte cliff: een klant met 200 actieve debiteuren krijgt cursus-resume (line 1987) die nooit voltooit → dunning stalt vanaf rij 100, vervallen herinneringen worden silent overgeslagen, debiteurensaldo loopt op. Detectie: nul — geen alert wanneer `dunningCursor` >7 dagen niet op 1 staat. Blast: per klant. MTTR: onbekend (geen detectie).

**3. Sheet-corruptie door klant** (Setup.gs:405 `controleerEnHerstelTabbladen_`)
Klant verwijdert kolom of tabblad. Self-heal maakt tab opnieuw aan **zonder data** (line 429) + meldt owner. Voor kolom-delete is er **niets**: `getDataRange().getValues()` schuift alle indices op → BTW r1a/r1b classificatie corrupt vanaf eerste boeking. Recovery = "Bestand → Versiegeschiedenis" (advies in audit). Detectie: gezondheidcheck pakt balans-mismatch (>€0,05), pas dagelijks. MTTR: uren per klant, hand-werk.

**4. Mollie webhook outage of klant-zonder-webhook-secret**
Webhook-handler verifieert HMAC alleen als `MOLLIE_WEBHOOK_SECRET` gezet is (Mollie.gs:160) — zonder secret: replay/forge mogelijk. Bij Mollie-down: klant ziet niets, betaling komt later via webhook-retry binnen (factuur blijft OPEN). Geen alert. Detectie: alleen via `controleerBetalingsIntegriteit_` (GezondheidCheck.gs:440), draait dagelijks stil. MTTR: dagen.

**5. OAuth-revoke / Sam's master-script disabled door Google** (appsscript.json scopes incl. `gmail.send`, `drive.file`)
Klant kan toestemming intrekken → alle triggers werken zonder log. `installeelTriggers_` (Setup.gs line 772 per invariants) wist eerst alles. Bij OAuth-fout schrijft niemand naar audit-log — pure stille dood. Detectie: nul.

## Top 3 missende monitoring/alerting

- **Geen per-klant heartbeat**. `HEALTHCHECK_DAGELIJKSE_TAKEN` (Triggers.gs:1609) is één UUID hard-coded — pingt alleen vanuit Sam's eigen sheet. 2.000 klanten = 2.000 zwarte dozen. Fix: license-server moet `lastSeen` registreren bij `valideer`-call en alerten >48h stilte.
- **Geen alert op `meldFataalAanOwner_`-volume** (Metrics.gs:144). Cache-throttle (1u/categorie/sheet) is per-sheet — bij massale corruptie krijgt Sam alleen eerste klant te zien.
- **Geen alert op license-server "geldig:false" rate-spike**. Een bug in license-validation lijkt op een geldige revoke. Threshold-alert ontbreekt.

## Top 3 quotum-cliffs

- **UrlFetchApp 20k/dag per script**: license-validate (1× per klant per 24u via UserProperty `licentieLastCheck`) + Mollie payment-create per factuur + KvK-API + healthcheck. Bij 5.000 klanten en gemiddeld 4 facturen/dag/klant + license-checks ≈ 25k/dag, **breekt rond 4.000 klanten** — maar elk script heeft eigen quotum dus dit raakt pas Sam's master-license-server, niet klanten.
- **Gmail 100/dag (consumer) per klant**: kapt af bij ~80 facturen + dunnings/dag. Workspace = 1.500/dag. ZZP'er met seizoenpiek (december-facturatie) raakt dit. `dunningCursor` (line 1987) maskeert het.
- **ScriptProperties 500KB / 9KB per key**: `herinneringsStap_*` + `mollie_completed_*` accumuleren. Cleanup-taken aanwezig (line 1689, 1691) — maar `emailVerzonden_F000001`-keys (Triggers.gs:742) hebben **geen cleanup**. Bij 10.000 facturen → quotum-overschrijding → `setProperty` faalt → ghost-success protectie breekt.

## Hoogste-prio operationele fix vóór 1.000 klanten

**Per-klant heartbeat naar license-server bij `dagelijkseTaken` SUCCESS-ping**, met dashboard "klanten die >48u geen heartbeat sturen". Eén regel in Triggers.gs:1703 toevoegen aan de bestaande UrlFetch (`&sleutel=...&ssId=...`). Server-side: rij in `lastSeen`-tabel. Zonder dit is "2.000 klanten down" letterlijk onbewijsbaar én onwaarneembaar — Sam ontdekt het pas via support-tickets. Alles anders (DLQ, audit-keten, Noah's Ark) is forensisch waardevol maar geeft je 's nachts om 23:47 geen signaal.

**Bonus reality-check:** vakantie 3 weken = OK voor data-integriteit (audit-keten, auto-backup 30d, Noah's Ark JSONL), **niet OK voor license-server outage** (>7d grace verstrijkt) en **niet OK voor cleanup van `emailVerzonden_*` ScriptProperties**.

Key files: `/home/user/boekhouding-engine/src/Licentie.gs:847`, `/home/user/boekhouding-engine/src/Triggers.gs:1611`, `/home/user/boekhouding-engine/src/Triggers.gs:1958`, `/home/user/boekhouding-engine/src/Mollie.gs:149`, `/home/user/boekhouding-engine/src/Setup.gs:405`, `/home/user/boekhouding-engine/src/ExportAccountant.gs:378`, `/home/user/boekhouding-engine/.github/workflows/health-monitor.yml`.
