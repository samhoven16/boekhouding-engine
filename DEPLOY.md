# Deploy & Apps Script overzicht

## Welke 3 Apps Script projecten zijn er?

| # | Naam in Drive | Wat het is | Welke folder in repo | Script-ID |
|---|---|---|---|---|
| 1 | **`Boekhoudbaar klant-kopie`** | Master-template Apps Script — gebonden aan de master-spreadsheet. **Hier zit ALLE hoofdcode** (Dashboard, Belastingadvies, BTW, alle 35 `.gs` files). | `src/` | `1FTj0KZr4JufoIrqhndbq1mG-ipDgxbIVDtvqEWZIVF-o3h5BEf5CoLKZ` |
| 2 | **`Boekhoudbaar - Licentieserver`** | Standalone web-app — server endpoint voor OTP-verzendingen + licentie-validatie. Geen spreadsheet-koppeling want het is een API die door klant-kopieën wordt aangeroepen. | `licence-server/` | `1BCD4S3n9rL0zWDufqBpiGZotYw5ihJ6NSIyKRXSB3ji7BlN5M7pD-tRc` |
| 3 | **`boekhouding`** | **OUDE versie — kan weg.** Zit niet in deze repo, niet meer in gebruik. Veilig te verwijderen of archiveren in Drive. | — | — |

> ⚠️ **De naam "klant-kopie" is verwarrend.** Het is eigenlijk het **master-template** waarvan klanten een kopie krijgen. Overweeg om het in Apps Script editor te hernoemen naar `Boekhoudbaar (Master)`.

## Hoe deploy je?

### Optie 1 — Alleen Boekhoudbaar master pushen (meest gebruikt)
```bash
npm run deploy
```
Dit doet: `npm test` + `clasp push` naar het script-ID in `.clasp.json` = **Boekhoudbaar klant-kopie**.

### Optie 2 — Alleen licentieserver pushen
```bash
npm run deploy:licence
```
Dit pusht alleen `licence-server/` naar het standalone licentieserver-script.

### Optie 3 — Beide tegelijk pushen
```bash
npm run deploy:all
```

### Optie 4 — Snel check (geen test, geen push)
```bash
npm run deploy:check
```
Toont welke script-IDs zijn geconfigureerd zonder te pushen.

## Eerste keer deploy?

```bash
# 1. Login bij clasp (eenmalig)
npx clasp login

# 2. Push code
npm run deploy
```

## Waarom kun jij (eigenaar) niet in Boekhoudbaar?

Je gebruikt `samhoven16@gmail.com`. Die staat **hardcoded als admin** in `src/Licentie.gs` (regel ~44):

```javascript
const ADMIN_EMAILS = [
  'samhoven16@gmail.com',
];
```

`isEigenaarBypass_()` checkt deze als eerste — als je inlogt met dat account, wordt licentiecheck **automatisch overgeslagen**.

**Maar dit werkt alleen als de NIEUWE code in je Apps Script project staat.** Als je nog niet hebt gedeployed:

```bash
npm run deploy
```

Daarna spreadsheet **herladen** (Ctrl+R / F5). Geen knop, geen wachten — werkt direct.

## Hoe de klant-flow werkt (toekomst — nog niet automatisch)

Voor nu (handmatig):
1. Klant betaalt op website
2. Jij krijgt notificatie
3. Jij maakt manueel kopie via Drive: rechtsklik master → "Een kopie maken"
4. Deelt kopie met klant
5. Licentieserver-OTP doet de rest

Voor toekomst (geautomatiseerd, zie `.claude/klant-kopie-flow-ideeen.md`):
1. Klant betaalt → Stripe webhook
2. Backend roept licentie-server endpoint aan
3. Apps Script web-app maakt automatisch kopie + stuurt deelt-link + OTP-mail
4. Klant ontvangt 1 mail → klikt → activeert → klaar

## Troubleshooting

### "Licentieserver niet geconfigureerd"
**Dit hoort niet meer te gebeuren** als je `samhoven16@gmail.com` gebruikt + nieuwe code is gedeployed.
Als het tóch verschijnt:
1. Check of `npm run deploy` is uitgevoerd
2. Open Apps Script editor → controleer of `Licentie.gs` `ADMIN_EMAILS` bevat
3. Run handmatig functie `activeerEigenaarLicentie` in Apps Script editor (laatste redmiddel)

### Clasp login expired
```bash
npx clasp logout
npx clasp login
```

### "Push failed: file too large"
`appsscript.json` of `.gs` bestand >10MB. Niet waarschijnlijk in deze repo.

### Welke Apps Script open ik in Drive?
- Voor code-wijzigingen: **`Boekhoudbaar klant-kopie`** (heeft de master spreadsheet)
- Voor licentie-server logs: **`Boekhoudbaar - Licentieserver`**
- Negeer/verwijder: **`boekhouding`** (oude versie)
