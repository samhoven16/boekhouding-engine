# Noordster-manifest — Boekhoudbaar (business #1)

> Dit bestand is het contract tussen Boekhoudbaar en Noordster. Het staat in
> déze repo, naast de code, zodat het meebeweegt met wat er werkelijk is.
> Noordster-agents lezen dit eerst. Wat hier `TODO(sam)` heet, is bewust leeg:
> verzin het niet, vraag het of haal het uit de bron.
> Feiten hieronder komen uit de repo (CONTEXT.md, INFRA.md, package.json,
> .claude/); verifieer cijfers en statussen opnieuw voordat je erop bouwt.

## 1. Wat het is
- Product: ZZP-boekhouding in Google Apps Script, verkocht als eenmalige
  licentie van €49 via boekhoudbaar.nl. Data staat in de Drive van de klant.
- Geldstroom: klant betaalt via Mollie → licentieserver geeft een licentie
  uit → klant activeert via OTP. Omzet = aantal verkochte licenties × €49.
  Er is geen terugkerende omzet in het huidige model.

## 2. Onderdelen en waar ze draaien
| Onderdeel | Pad | Draait op | Deploy |
|---|---|---|---|
| Boekhoudapplicatie | `src/` | Apps Script (per klant) | `npm run push:gas` |
| Licentieserver | `licence-server/` | Apps Script web-app | `npm run push:licence` |
| Website | `website/` | Cloudflare Pages | git push |
| Tests / lint | `tests/` | lokaal / CI | `npm test`, `npm run lint:changed` |

## 3. Wat Noordster-agents mogen en niet mogen
**Zelfstandig (laag risico, terug te draaien):** lezen, auditen, tests
schrijven, content/SEO-concepten, PR's als draft, runbooks bijwerken.
**Alleen na akkoord van Sam:** productie-deploy (`push:gas`, `push:licence`),
prijs- of licentie-wijzigingen, mails naar klanten, alles met Mollie of
echte betalingen, fiscale tarieven wijzigen (eerst bronverificatie).
**Nooit:** `.clasp.json` naar prod zetten zonder `env:prod`-bewuste keuze;
geheimen in de repo; code-wijzigingen en audit in dezelfde commit.

## 4. Verplichte werkwijze (uit CLAUDE.md, geldt ook voor Noordster-agents)
1. Eerst `.claude/`-artefacten, dan `npm run impact`, dan pas code lezen.
2. Kleinste veilige wijziging; gerichte tests (`npm run test:flow`).
3. Elke BLOCKER/HOOG-fix krijgt een regressietest (ledger-ratel).
4. Een bevinding is pas klaar als de bug-KLASSE gesloten is
   (`.claude/bug-class-register.md`), niet alleen de instantie.
5. Externe feiten (tarieven, API's) alleen uit de primaire bron, met
   bron en datum (`.claude/rb-verificatie-checklist-2026.md`).

## 5. Agent-rooster (bestaand, in `.claude/agents/`)
tax-compliance · accountant-en-belastingdienst · red-team-adversary ·
gas-runtime-auditor · langlopend-onderhoud · cross-pr-regressie ·
documentatie-volledigheid · customer-voice-editor · onboarding-doorloop ·
friction-killer-google-niet-geverifieerd · seo-strategist ·
content-gap-detector · positionering-redacteur.
Commando: `/audit` (integrale her-audit met closure-ledger).

## 6. Wat geld oplevert (volgorde van impact)
1. **Koopflow zonder wrijving.** Kritiek punt is het Google-scherm "niet
   geverifieerd" in de activatie. Agent: friction-killer + onboarding-doorloop.
2. **Verkeer.** Gidsen en vergelijkingspagina's vangen zoekverkeer; de
   10-keywordsstrategie staat in `.claude/groei-trojaans-paard.md`.
   Agent: seo-strategist + content-gap-detector.
3. **Vertrouwen.** Claims op de site moeten kloppen met de code
   (testimonials, gebruikersaantallen, vergelijkingstabel).
   Agent: positionering-redacteur + customer-voice-editor.
4. **Minder handwerk voor Sam.** Support-antwoorden en runbooks.
   Agent: documentatie-volledigheid.

## 7. Open punten die alleen Sam kan sluiten
- Fiscale 2026-waarden zijn niet door een registerbelastingadviseur
  bevestigd (zie `.claude/go-live-readiness.md`, sectie A).
- Eén live end-to-end doorloop van het Google-toestemmingsscherm.
- Tweede beheerder / noodpad (bus-factor): `ADMIN_EMAILS_EXTRA` is gebouwd,
  maar moet nog gevuld worden.

## 8. Meetpunten voor Noordster (bron nog aan te sluiten)
| Meetpunt | Bron | Status |
|---|---|---|
| Verkochte licenties per week | Mollie / licentieserver | TODO(sam): bron en toegang |
| Bezoekers → koopknop → betaald | Cloudflare analytics / Mollie | TODO(sam) |
| Activatie gelukt (OTP afgerond) | licentieserver-log | TODO(sam) |
| Supportmails per week | inbox support@boekhoudbaar.nl | TODO(sam) |
| Openstaande BLOCKER/HOOG | `.claude/audit-ledger.md` | beschikbaar |
