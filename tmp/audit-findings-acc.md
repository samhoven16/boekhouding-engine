# Audit-findings — accountant-en-belastingdienst
Hashes van gelezen file-versies: zie tmp/file-hashes.txt.

## Batch ACC-A — Boekingen.gs, FormeelBewijs.gs, Invariants.gs

### src/Boekingen.gs
Gelezen: regels 1-1480
Aspecten:
- Audit-trail: OK — maakJournaalpost_ legt aanmaakdatum vast (118), validatie-email/-datum (126-127); storno + ontgrendeling loggen motivatie + gebruiker (260, 1411-1421). VONDST F-ACC-003.
- Hashketen + extern anker: VONDST F-ACC-001 (geen per-rij-keten op journaalposten; keten alleen in ScriptProperties-auditbuffer met klant-Editor-rechten).
- Periode-locks (I₈): OK regel 16-51 (dubbele guard 21-34 + 40-51). VONDST F-ACC-002 (corrupt JSON ⇒ fail-open).
- I₁ debet=credit: OK regels 62-88 (valideerInvariantsVoorJournaalpost_ + valideerTransactieFormeel_ in centen vóór write).
- I₂: OK regels 139-181 (compensating rollback); VONDST F-ACC-004 (onbekende rekening ⇒ stille balansdrift, 444-465).
- I₃: n.v.t., zit in Rapportages/controleerBalansStrikt_.
- Storno: OK regels 205-283 (inverse tegenboeking, origineel blijft, dubbel-storno geblokkeerd 224-226). VONDST F-ACC-005 (detectie via substring-match).
- Bewaarplicht: n.v.t. hier. Reproduceerbare BTW-aangifte: VONDST F-ACC-006 (storno zet factuur-BTW op 0, 307-309/323-325).

### src/FormeelBewijs.gs
Gelezen: regels 1-539
Aspecten:
- Audit-trail: OK 134-139. Hashketen: n.v.t., post-hoc verificatie-runner.
- I₈: VONDST F-ACC-007 (skip bij ontbrekende aangemaakt-kolom, 421-428).
- I₁: VONDST F-ACC-008 (telt zelfde bedrag op debet én credit, kan nooit falen, 166-168).
- I₂: OK 184-225. I₃: OK 230-251. Storno: OK 164-165, 194-195, 264-265.
- I₅: OK 288-319; VONDST F-ACC-009 (alleen huidig kwartaal).

### src/Invariants.gs
Gelezen: regels 1-760
Aspecten:
- Audit-trail: OK 162-169, 288-292. Hashketen: n.v.t., validator-module.
- I₈: OK 569-577 (T5). I₁: OK 503-535 (T1/T2/T3 in gehele centen).
- I₂: OK 542-567 (T4); VONDST F-ACC-010 (T4 overgeslagen zonder GB-tabblad).
- Storno: OK 207-214. Bewaarplicht: OK 331-417; VONDST F-ACC-011 (helper niet afgedwongen in write-flow).
- BTW: OK 188-249, 631-670.

#### F-ACC-001 [HOOG] src/Boekingen.gs:90-137
Quote: `sheet.appendRow(rij);` (regel 132) — journaalpost-rij bevat geen per-rij-hash of keten-veld.
Probleem: JOURNAALPOSTEN-sheet heeft geen onveranderbaar anker per rij. Enige tamper-detectie is de SHA256-keten in schrijfAuditLog_ (BoekingEngine.gs:824-867) in ScriptProperties waar de klant als eigenaar Editor-rechten op heeft (zelf gemarkeerd als KNOWN LIMITATION, 862-867). Klant kan bedrag/datum van bestaande rij overtypen; I₂-check detecteert dat alleen als GB-saldo niet meebeweegt, en klant kan beide wijzigen. Art. 52 AWR eist dat originelen niet retroactief wijzigbaar zijn zonder spoor; sheet-protection is voor de eigenaar detective, niet preventief.
Fix: per rij rijHash = SHA256(prevRijHash + boekingId + datum + debet + credit + bedrag) in eigen kolom; laatste hash periodiek extern ankeren; bewijsrunner verifieert keten.
Owner: Sam (dev)

#### F-ACC-002 [HOOG] src/Boekingen.gs:1209-1241
Quote: `} catch (jsonErr) { ... return []; }`
Probleem: corrupt GESLOTEN_PERIODES-JSON ⇒ _leesGeslotenPeriodes_ geeft lege lijst ⇒ maakJournaalpost_ (21-22) ziet géén gesloten periodes ⇒ I₈ staat uit; klant kan stil in afgesloten kwartaal boeken. Jaarafsluit-guard (40-51) vangt alleen volledig afgesloten boekjaren (JA-tag), niet losse BTW-kwartalen.
Fix: fail-closed: bij corrupt JSON elke datum vóór de huidige BTW-periode weigeren tot reconstructie.
Owner: Sam (dev)

#### F-ACC-003 [MIDDEL] src/Boekingen.gs:125-127
Quote: `opt.preGevalideerd === true ? 'Gevalideerd' : 'Concept',` / `... ? (Session.getActiveUser().getEmail() ...) : '',`
Probleem: auto-boekingen krijgen status Concept met leeg "gevalideerd door"; steekproef "wie maakte deze boeking?" heeft geen antwoord tot handmatige validatie. aangemaakt-op (118) is systeemtimestamp, geen wie.
Fix: aparte "aangemaakt door"-kolom (Session-email of 'systeem/trigger').
Owner: Sam (dev)

#### F-ACC-004 [HOOG] src/Boekingen.gs:444-465
Quote: `Logger.log('updateGrootboekSaldo_: onbekende rekening ' + rekeningCode ...` — log/audit, geen throw.
Probleem: journaalpost op niet-bestaande rekening slaagt (132) maar GB-saldo beweegt niet ⇒ zwevende boeking, I₂-drift. T4 zou dit vooraf weigeren maar wordt overgeslagen zonder GB-tabblad (F-ACC-010) of als valideerTransactieFormeel_ niet geladen (typeof-guard regel 82).
Fix: fail-closed (throw + rij CORRUPT markeren) of T4 altijd garanderen.
Owner: Sam (dev)

#### F-ACC-005 [MIDDEL] src/Boekingen.gs:219-226
Quote: `if (omschr.indexOf('STORNO ' + origineelBoekingId) !== -1) alGestorneerd = true;`
Probleem: dubbel-storno-detectie via vrije-tekst substring in omschrijving; handmatige rij met die tekst ⇒ vals alarm, verwijderde tekst ⇒ omzeiling ⇒ dubbele storno maakt origineel weer effectief.
Fix: gestructureerde kolom gestorneerdDoorBoekingId/storneertBoekingId.
Owner: Sam (dev)

#### F-ACC-006 [HOOG] src/Boekingen.gs:307-309, 323-325
Quote: `vfSheet.getRange(i + 1, 12).setValue(0);` / `ifSheet.getRange(i + 1, 11).setValue(0);`
Probleem: storno overschrijft het BTW-bedrag van de oorspronkelijke factuurrij naar 0 — destructieve mutatie van het bewijsstuk i.p.v. tegenboeking. BTW-aangifte niet meer reproduceerbaar uit ruwe data; origineel gefactureerd BTW-bedrag verdwenen (art. 52 AWR). I₄-check slaat gestorneerde rijen over (FormeelBewijs.gs:264-265) dus excl+0 ≠ incl wordt niet gedetecteerd.
Fix: creditnota/tegenregel; berekenBtwAangifte_ netteren per status.
Owner: Sam (dev)

#### F-ACC-007 [MIDDEL] src/FormeelBewijs.gs:421-428
Quote: `const aangemaakt = data[i][14];` ... `if (aangemaakt instanceof Date && periodes[p].geslotenOp) { ... }`
Probleem: post-hoc I₈-check slaat rijen met lege/geen-Date aangemaakt-cel stil over — precies hoe een klant retroactief zonder systeemtimestamp zou boeken.
Fix: datum-in-gesloten-periode + ontbrekende timestamp = verdachte inbreuk rapporteren.
Owner: Sam (dev)

#### F-ACC-008 [MIDDEL] src/FormeelBewijs.gs:163-178
Quote: `totaalDebet += bedrag;` / `totaalCredit += bedrag; // credit-zijde van deze journaalpost (gelijk per I₁)`
Probleem: I₁-bewijs telt per rij hetzelfde bedrag op beide zijden ⇒ kan per constructie nooit falen; verifieert niets. Docstring claimt ΣDebet=ΣCredit-verificatie (157-159). Vals-positieve zekerheid.
Fix: echte debet/credit-aggregatie toetsen of als no-op schrappen.
Owner: Sam (dev)

#### F-ACC-009 [LAAG] src/FormeelBewijs.gs:293-298
Quote: `const q = Math.floor(nu.getMonth() / 3); const van = new Date(nu.getFullYear(), q * 3, 1);`
Probleem: I₅ verifieert alleen het lopende kwartaal; historische ingediende aangiften worden niet nagerekend.
Fix: I₅ over opgegeven periode-range laten itereren.
Owner: Sam (dev)

#### F-ACC-010 [MIDDEL] src/Invariants.gs:540-567
Quote: `const gb = ss && typeof ss.getSheetByName === 'function' ? ss.getSheetByName(SHEETS.GROOTBOEKSCHEMA) : null; if (gb) { ... }`
Probleem: T4 (rekening-existentie) draait alleen mét GROOTBOEKSCHEMA-tabblad; ontbreekt het, dan passeert een boeking op niet-bestaande rekening en logt updateGrootboekSaldo_ alleen (F-ACC-004).
Fix: fail-closed weigeren zonder GROOTBOEKSCHEMA.
Owner: Sam (dev)

#### F-ACC-011 [MIDDEL] src/Invariants.gs:331-340
Quote: `function bepaalBewaarplichtTot_(bewaarplichtTot, isOnroerend) { ... }`
Probleem: docstring claimt invariant "bewaarplicht-record op elk financieel record" (regel 17), maar bepaalBewaarplichtTot_ wordt door geen schrijf-validator (431-439, 448-450, 503-578) aangeroepen — claim niet afgedwongen.
Fix: claim verlagen of afdwingen in write-flow.
Owner: Sam (dev)

Verdict batch ACC-A: ⚠️ ZORGEN. Kern solide (centen-exacte I₁-afdwinging vooraf, periode-guards, storno via tegenboeking, bewijsrunner) maar onveranderbaarheid en reproduceerbaarheid hebben openingen: F-ACC-001 (geen rij-keten), F-ACC-002/004 (fail-open), F-ACC-006 (destructieve storno-mutatie), F-ACC-008 (no-op I₁-bewijs). Confidence controle-overleving: middel.

## Batch ACC-B — ExportAccountant.gs, XafExport.gs, DataPortability.gs, Hygiene.gs

### src/ExportAccountant.gs
Gelezen: regels 1-1076
Aspecten:
- XAF: delegeert naar _bouwXafXml_ (93-96); F-ACC-030 (boekjaar-mismatch).
- Accountant zonder onboarding: deels OK via maakAccountantInstructies_ (284-318) + LEESMIJ; VONDST F-ACC-031 (CSV zonder kolom-legenda).
- Volledigheid: VONDST F-ACC-032 (CSV ongefilterd, mengt boekjaren; 65-86, 805-827).
- BTW-reconstructie: VONDST F-ACC-033 (overzicht mist r1c/r1d/r1e/r2/r3/r4/r5d; 262-282).
- Bewaarplicht: backups (328-643) + NoahArk JSONL (726-799) solide; VONDST F-ACC-034 (GFS-retentie trasht; claim overstated).
- Audit-trail in exports: OK 671-683 (Audit Log in NoahArk, 681).

### src/XafExport.gs
Gelezen: regels 1-393
Aspecten:
- XAF 3.2 multi-dagboek: VONDST F-ACC-035 (mono-dagboek ALG; 304-307). Jaar-header OK (157-159). Escaping OK via _xafEsc_ (385-393).
- BTW-tags: VONDST F-ACC-036 (geen vat/vatCode/vatAmnt; 349-369).
- Volledigheid: jaar-filter OK (320-332); VONDST F-ACC-037 (stil skippen bedrag<=0/lege rekening; 338).
- Saldi: VONDST F-ACC-038 (geen opening/closing balances; 175-189).
- Hygiene: n.v.t. Audit-trail: OK docRef/nr = Boeking ID (344, 353).

### src/DataPortability.gs
Gelezen: regels 1-216
Aspecten:
- XAF: n.v.t. (XLSX/JSONL/JSON). Volledigheid: audit-log volledig (71-113) OK; PDF-index met resolve-check (149-204) OK; VONDST F-ACC-039 (URL-loze facturen niet geteld).
- Bewaarplicht: OK 71-113 (AWR-referentie 108). Hygiene: n.v.t.

### src/Hygiene.gs
Gelezen: regels 1-243
Aspecten:
- Export/XAF/BTW: n.v.t. (trigger/lock/logging-infra).
- Opschoning: VONDST F-ACC-040 (_SYSTEM_LOG-trim 234-239; scheiding met fiscale audit-trail ongedocumenteerd). sanitizeTriggers_ raakt geen administratie-data. _SYSTEM_LOG verborgen sheet (223), los van Audit Log = OK.

#### F-ACC-030 [HOOG] src/ExportAccountant.gs:46 + src/XafExport.gs:144
Quote: `const jaar = getBoekjaar_();` (ExportAccountant) vs `const jaar = new Date().getFullYear();` (XafExport _bouwXafXml_)
Probleem: accountantspakket bepaalt jaar via getBoekjaar_() maar de meegebakken XAF (regel 94) hardcodeert het huidige kalenderjaar. Pakket voor boekjaar 2025 geëxporteerd in juni 2026 ⇒ CSV's *_2025.csv + XAF met fiscalYear 2026 en transactiefilter op 2026 (leeg/verkeerd jaar).
Fix: _bouwXafXml_ jaar-parameter (default getBoekjaar_()); doorgeven op regel 94 en in losse menu-actie.
Owner: Sam (dev)

#### F-ACC-031 [MIDDEL] src/ExportAccountant.gs:805
Quote: `function exporteerAlsCsv_(ss, sheetNaam) { ... const data = sheet.getDataRange().getValues();`
Probleem: CSV's nemen interne sheet-headers letterlijk over; geen kolom-legenda; LEESMIJ (284-318) beschrijft bestanden, niet kolommen.
Fix: kolomuitleg.txt of herkenbare labels in exporteerAlsCsv_.
Owner: accountant (communicatie) / Sam (dev)

#### F-ACC-032 [HOOG] src/ExportAccountant.gs:65-86, 809
Quote: `const data = sheet.getDataRange().getValues();` (geen datumfilter)
Probleem: bestanden heten `2_Journaalposten_${jaar}.csv` maar bevatten ALLE jaren — geen boekjaar-filter. Misleidend en niet reproduceerbaar voor jaarrekening/aansluiting.
Fix: filter op boekjaar of hernoem + documenteer "volledige administratie".
Owner: Sam (dev)

#### F-ACC-033 [MIDDEL] src/ExportAccountant.gs:271-274
Quote: `lijnen.push(\`  Voorbelasting:     ${formatBedrag_(aangifte.r5b)}\`);`
Probleem: BTW-overzicht toont alleen r1a/r1b/r5b/saldo; r1c/r1d/r1e/r2/r3/r4/r5d ontbreken ⇒ aangifte niet reconstrueerbaar voor niet-standaard posten.
Fix: alle rubrieken printen in maakBtwOverzichtTekst_.
Owner: Sam (dev)

#### F-ACC-034 [MIDDEL] src/ExportAccountant.gs:438-453, 595-643
Quote: `f.setTrashed(true); opgeschoond++;`
Probleem: GFS-retentie trasht backups buiten laatste-7-dagen/eerste-van-maand terwijl README "perfect voor Belastingdienst-controle" claimt; communicatief overstated (backups ≠ wettelijk archief).
Fix: claim nuanceren of jaar-backups oneindig + audit-logregel per trash.
Owner: accountant (communicatie) / Sam (dev)

#### F-ACC-035 [HOOG] src/XafExport.gs:304-307
Quote: `xml += '      <journal>\n'; xml += '        <jrnID>ALG</jrnID>\n'; xml += '        <jrnTp>O</jrnTp>\n';`
Probleem: alle posten in één kunstmatig dagboek ALG/type O terwijl de sheet een echte Dagboek-kolom heeft (rij[3], comment 298). XAF 3.2 verwacht journal per dagboek met passend jrnTp (S/P/B/M); controleur kan verkoop niet van inkoop scheiden. Comment (136) claimt "multi-dagboek", implementatie is mono.
Fix: groeperen op rij[3], journal per dagboek met gemapt jrnTp.
Owner: Sam (dev)

#### F-ACC-036 [HOOG] src/XafExport.gs:349-369
Quote: `<amnt>' + bedrag.toFixed(2) + '</amnt>` ... `<amntTp>D</amntTp>` (geen vat-element)
Probleem: trLines bevatten geen vatCode/vat/vatAmnt terwijl sheet BTW % (rij[9]) en BTW bedrag (rij[10]) heeft ⇒ aangifte niet herleidbaar uit XAF; importerende software krijgt geen BTW-codering. Wezenlijke leemte voor Belastingdienst-auditfile.
Fix: per trLine vatCode + vat/vatAmnt op basis van rij[9]/[10] met rubriek-aansluitende code-tabel.
Owner: Sam (dev)

#### F-ACC-037 [MIDDEL] src/XafExport.gs:338
Quote: `if (!id || !debet || !credit || bedrag <= 0) continue;`
Probleem: bedrag 0/negatief of lege rekening stil overgeslagen zonder telling/audit-spoor; legitieme correctieboekingen verdwijnen uit auditfile; som debet/credit (373-374) wordt nergens weggeschreven of gevalideerd ⇒ onverklaard gat bij aansluiting.
Fix: skips tellen + loggen; negatieve bedragen als omgekeerde D/C behandelen.
Owner: Sam (dev)

#### F-ACC-038 [MIDDEL] src/XafExport.gs:175-189
Quote: `xml += '    <generalLedger>\n'; xml += _bouwGrootboekXml_(ss);`
Probleem: generalLedger bevat alleen stamgegevens, geen begin-/eindsaldi ⇒ grootboeksaldi niet reproduceerbaar uit het XAF alleen; geen openingsbalans-anker.
Fix: openingsbalans per ledgerAccount toevoegen.
Owner: Sam (dev)

#### F-ACC-039 [MIDDEL] src/DataPortability.gs:160-201
Quote: `const url = String(data[i][19] || '').trim(); if (!url) continue;`
Probleem: facturen zonder PDF-URL worden in de PDF-index genegeerd i.p.v. als "ontbrekend" geteld; "totaalFacturen" = aantal met URL ⇒ bewijslast-gaten onzichtbaar.
Fix: URL-loze facturen apart tellen ("geen_pdf") in statusoverzicht.
Owner: Sam (dev)

#### F-ACC-040 [LAAG] src/Hygiene.gs:234-239
Quote: `const teVerwijderen = Math.floor(_HYGIENE_LOG_MAX_ROWS * 0.2); try { sheet.deleteRows(2, teVerwijderen); } catch (_) {}`
Probleem: _SYSTEM_LOG-trim is veilig zolang er nooit fiscaal-relevante events heen gerouteerd worden; die scheiding is nergens gedocumenteerd — latente valkuil.
Fix: comment bij _HYGIENE_LOG_SHEET: nooit fiscale mutaties hier, exclusief Audit Log.
Owner: Sam (dev)

Zwaartepunt ACC-B: F-ACC-035 + F-ACC-036 (XAF mist dagboekstructuur en BTW-codering) en F-ACC-030/032 (jaar-consistentie pakket).
