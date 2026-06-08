# 🚨 PRODUCTIE DOWN — 403 host_not_allowed Cloudflare Troubleshoot

> Status: **productie www.boekhoudbaar.nl geeft op alle URLs HTTP 403 met header `x-deny-reason: host_not_allowed`.**
>
> Dit is GEEN code-bug — repo-tests groen, lokale serve werkt, alle commits gemerged. Het is een **Cloudflare-account/dashboard instelling**.

## Diagnose-resultaten (08-jun-2026 09:16)

```
GET https://www.boekhoudbaar.nl/                      → 403
GET https://www.boekhoudbaar.nl/demo/                  → 403
GET https://www.boekhoudbaar.nl/kopen/                 → 403  (gisteren al)
GET https://www.boekhoudbaar.nl/voorwaarden/           → 403
GET https://boekhouding-engine.pages.dev/              → 403  ← zelfs de raw Cloudflare-host!
GET https://d0318a06.boekhouding-engine.pages.dev/     → 403  ← deploy-hash subdomain ook!

Response body: "Host not in allowlist" (21 bytes plain text)
Response header: x-deny-reason: host_not_allowed
```

**Conclusie:** elke deploy-URL geeft 403. Het is geen specifieke pagina, geen specifieke host, geen Cloudflare WAF (die zou HTML-pagina geven). Dit is een **Worker-script of Cloudflare-instelling op accountniveau** die actief alle requests intercepteert.

## Sam's checklist — in deze volgorde

### Stap 1 — Cloudflare Workers Routes (waarschijnlijkste oorzaak)

1. Open https://dash.cloudflare.com/
2. Selecteer **boekhoudbaar.nl** zone
3. Ga naar **Workers Routes** (linker menu)
4. Zoek naar routes op:
   - `*.boekhoudbaar.nl/*`
   - `boekhoudbaar.nl/*`
   - `www.boekhoudbaar.nl/*`
5. **Als je een route ziet die je niet herkent of naar een onbekende Worker wijst → klik "Delete" of "Disable"**

> Verdachte signalen: Worker-naam met "auth", "gate", "guard", "allowlist", "host-check", of een willekeurige UUID.

### Stap 2 — `samhoven16.workers.dev` Worker bekijken

Je dashboard toont een Worker op `samhoven16.workers.dev`. Dat is je persoonlijke Workers-subdomain.

1. Cloudflare → **Workers & Pages → Overview**
2. Klik op de Worker (er zou er 1 zijn met die naam)
3. Klik op de Worker → bekijk de code:
   - Bevat hij `Host not in allowlist`-string?
   - Bevat hij een check `if (host !== ...) return 403`?
4. **Als de code de 403 returnt: identificeer welke routes deze Worker beslaat (vermoedelijk meer dan alleen `samhoven16.workers.dev`).**

### Stap 3 — Cloudflare Pages → Settings → Access

1. Cloudflare → **Workers & Pages → boekhouding-engine**
2. **Settings → Access**
3. Check of "**Cloudflare Access**" aanstaat — dat zou de site achter een login zetten.
4. Als ja: zet uit voor productie.

### Stap 4 — WAF Custom Rules

1. Cloudflare → boekhoudbaar.nl zone → **Security → WAF → Custom Rules**
2. Zoek naar rules met:
   - Action = "Block"
   - Field = "Host" of "Hostname"
   - Recent gewijzigd (laatste 7 dagen)
3. Disable of delete verdachte rules.

### Stap 5 — Account Billing & Status

1. Cloudflare → **Account → Billing**
2. Status moet "Active" zijn — bij "Past Due" of "Suspended" kan Cloudflare alles blokken.
3. Check ook **Account → Notifications** voor security/billing alerts.

### Stap 6 — DNS verificatie

1. Cloudflare → boekhoudbaar.nl zone → **DNS → Records**
2. Verifieer:
   - `www` CNAME → `boekhouding-engine.pages.dev` (oranje wolk aan)
   - Apex `@` → wijst naar Cloudflare Pages
3. Geen ongebruikelijke A-records of CNAMEs.

## Wat je MOET doen als je niets vindt

1. **Maak een nieuwe Cloudflare Pages deployment** met een nieuwe project-naam — als de huidige is "vergiftigd" met een instelling die je niet kan vinden, is een verse deploy het schoonste pad.
2. **Of: Cloudflare support contacteren**. Vraag specifiek naar "x-deny-reason: host_not_allowed" op het account — zij kunnen account-level instellingen zien die jij niet kan zien.

## Wat Claude (ik) kan doen zodra de Cloudflare-block weg is

- Re-test elke kritieke URL automatisch
- Bevestig dat dubbele logo en koopproces nu werken
- Voltooien van het criticus-rapport-vervolg (P1-2, K3, beginbalans)

## Het kost geen code-fix

Repo-state is gezond. Tests groen. Cloudflare Pages build groen. Het zit echt op Cloudflare-dashboard niveau.

— Aangemaakt 08 juni 2026, na 13 fixes uit het criticus-rapport.
