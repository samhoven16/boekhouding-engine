# Centrale config — operationele runbook

> **Dit is de hefboom voor langetermijn-onderhoud (#1 + #3).** Eén plek (de
> licentieserver) bepaalt tarieven, het kritieke-update-signaal, feature-flags
> en een broadcast voor **álle** klant-kopieën — zónder dat iemand een nieuwe
> sheet hoeft te kopiëren of code hoeft te pushen.

## Hoe het werkt
- Elke klant-kopie haalt 1×/24u `?actie=config` op (`haalConfigOp_`, fail-open
  naar 24u-cache → blijft werken als de server even plat ligt).
- `getBelasting_()` geeft **server-tarieven voorrang** op de code-tabel, met
  nette fallback + `TARIEF_VEROUDERD`-vlag.
- Alles staat in **ScriptProperties op het licentieserver-script**
  (Apps Script → Projectinstellingen → Scripteigenschappen).

⏱️ **Caveat:** wijzigingen landen binnen **24 uur** bij elke klant (cache-TTL).
Voor een acute push: zet ook het kritieke-signaal (zie onder) — dat dwingt actie af.

---

## 1. Tarieven updaten (jaarlijks, na Prinsjesdag)
Voorkomt dat klanten op verouderde fiscale cijfers draaien zodra een nieuw jaar
ingaat. Zet de ScriptProperty **`BELASTING_TARIEVEN`** op een JSON-object met het
jaar als key, in hetzelfde formaat als `BELASTING_PER_JAAR` in
`src/Belastingadvies.gs` (kopieer die structuur, vul de nieuwe cijfers in):

```json
{ "2027": { "ZELFSTANDIGENAFTREK": 900, "IB_SCHIJVEN": [ ... ], "KIA": [ ... ], ... } }
```
Klaar — binnen 24u rekent elke klant met de 2027-cijfers. Geen redeploy.
> Tip: laat een RB de cijfers aftekenen vóór je ze zet (zie `audit-ledger.md`).

## 2. Een kritieke update afdwingen (bv. een BTW-bug-fix)
Drie properties (samen):
- **`PRODUCT_VERSIE`** = de nieuwste versie, bv. `2.8.0`.
- **`VERSIE_ERNST`** = `kritiek` (i.p.v. `normaal`).
- **`VERSIE_KRITIEK_VOOR`** = JSON-lijst van versies die MOETEN updaten, bv.
  `["2.7.0","2.6.0"]`. Alleen die klanten zien de kritieke-update-modal.
- (optioneel) **`VERSIE_TOELICHTING`** = korte uitleg; **`VERSIE_INSTRUCTIES_URL`**
  (default `boekhoudbaar.nl/update/`).

Zet `VERSIE_ERNST` terug op `normaal` + leeg `VERSIE_KRITIEK_VOOR` zodra iedereen
bij is.

## 3. Eenmalig bericht naar alle klanten
**`GLOBAL_BERICHT`** = vrije tekst (bv. "Gepland onderhoud zondag 10:00-11:00").
Verschijnt 1×/dag/bericht in de sheet. Leeg = niets.

## 4. Een feature aan/uit zetten
**`FEATURE_FLAGS`** = JSON, bv. `{"ai_bonscan": true, "auto_apply_update": false}`.
Default fail-open per flag, behalve de bewust fail-closed `auto_apply_update`.

---

## Wat dit dekt van de "engineering naar 9.9"
- **#1 tarief-feed** — fiscale actualiteit jaar 1→10 zonder klant-redeploy. ✅
- **#3 emergency-signaal** — kritieke fixes pushen zonder dat iedereen toevallig
  het menu opent. ✅ (de bundle-levering zelf = handmatig pad / GitHub-fallback.)
- **API-endpoint-swap** — endpoints/versies centraal bijsturen via flags/config.

Geborgd tegen regressie door `tests/unit/centrale-config-contract.test.js`.
