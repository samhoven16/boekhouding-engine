# Boekhoudbaar — Updates ophalen

## Eén-commando-update (eenvoudigste manier)

```bash
cd ~/Documents/boekhouding-engine && npm run update
```

Dit doet **alles in één keer**:
1. Haalt de nieuwste code op (`git pull`)
2. Installeert nieuwe dependencies indien nodig (`npm install`)
3. Pusht naar je Apps Script project (`clasp push`)

Daarna spreadsheet **herladen** (Cmd+R) — klaar.

## Waarom moet je dit elke keer doen?

Tijdens deze ontwikkelfase fixen we issues op afstand:
1. Jij meldt een bug
2. Wij fixen 'm in de code (op GitHub)
3. **Jij moet de fix ophalen + deployen om hem te zien werken**

Dit is alleen tijdens de fix-fase. **Zodra alles werkt zoals het moet, hoef je nooit meer te deployen.** Je gebruikt dan gewoon je spreadsheet.

## Snelkoppeling toevoegen (optioneel)

Voeg dit één keer toe aan je `~/.zshrc`:

```bash
echo "alias bh-update='cd ~/Documents/boekhouding-engine && npm run update'" >> ~/.zshrc
source ~/.zshrc
```

Daarna kan je vanaf elke prompt typen:

```bash
bh-update
```

## Eerste-keer setup

```bash
# Eenmalig: clasp inloggen met je Google account
npx clasp login
# (gebruikt browser, kies samhoven16@gmail.com)
```

## Wat als deploy faalt?

| Fout | Oplossing |
|---|---|
| `Could not read package.json` | Je staat niet in de juiste folder: `cd ~/Documents/boekhouding-engine` |
| `Error retrieving access token` | Clasp niet ingelogd: `npx clasp login` |
| `clasp push failed` | Internetverbinding check, dan opnieuw `npm run deploy` |
| Spreadsheet ziet oude code | Browser tab sluiten, opnieuw openen (cache) |
