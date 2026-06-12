# Audit-findings — cross-validatie-invariants
Hashes van gelezen file-versies: zie tmp/file-hashes.txt.

## Batch INV-A — wiskundige-fundering.md, invariants.md, Invariants.gs, Boekingen.gs, Validaties.gs

### Per-invariant analyse (I₁-I₁₀)
- I₁: pre-write 3 lagen OK (Invariants.gs:108-133, 528-535 T3 in centen; Boekingen.gs:62-88, 100-128 één-rij-model). Geen tegenvoorbeeld via API. Geen suspensie.
- I₂: GEBROKEN — F-INV-002 (silent return bij lock-timeout/ontbrekend GB-tabblad, Boekingen.gs:380-384/388-392; rollback-laag 150-181 vuurt alleen op thrown errors). herberekeningGrootboekSaldi (490-573) veilig herstel.
- I₃: indirect via I₁+I₂; post-hoc FormeelBewijs.gs:230 (ε=0.05) + GezondheidCheck.gs:395. Zelfde tegenvoorbeeld als F-INV-002.
- I₄: pre-write gate is DODE CODE — F-INV-003 (valideerInvariantsVoorFactuur_/valideerBtwAansluiting_ nul callers in src/; tarief-domein {0,0.09,0.21} niet gevalideerd). Storno-suspensie VEILIG (markering + verifier-filter FormeelBewijs.gs:265 + aangifte-filter BTW.gs:192/269 consistent).
- I₅: n.v.t. batch; post-hoc FormeelBewijs.gs:288-319.
- I₆: OK drielaags (teller-lock Boekingen.gs:1028-1039; gate Invariants.gs:67-94 aangeroepen Triggers.gs:692-693; post-hoc). Restrisico F-INV-008 (TOCTOU).
- I₇: GEEN pre-write afdwinging — F-INV-006; verifier waarschuwing-only (TODO FormeelBewijs.gs:381-387 erkent dit).
- I₈: GEBROKEN — F-INV-001 (Invalid-Date-bypass van alle 3 gates) + F-INV-004 (post-hoc verifier leest kolom [14]=Notities i.p.v. [15]=Aangemaakt op ⇒ permanente no-op). Suspensies: ontgrendeling (1271-1430, 3 gates + duurzame audit) VEILIG; self-heal corrupt JSON (1202-1243) bewust compromis; jaarafsluitings-ordening veilig. Storno datum=NU correct.
- I₉: PARTIEEL — F-INV-005 (hard-block alleen 0100/0200/0300; 1400/4100 warn-only én eigen fallbacks boeken erop; verifier-heuristiek '000' mist ze).
- I₁₀: n.v.t. batch; dagelijks via Triggers.gs:1578-1579; "blokker vóór indienen"-claim (wiskundige-fundering.md:123) niet geverifieerd — voor BTW.gs-specialist.

### .claude/wiskundige-fundering.md
Gelezen: regels 1-135. Aspecten: I₁ OK 17-22; I₂ claim ondermijnd door F-INV-002 (24-32); I₃ OK 34-39; I₄ 41-47 → F-INV-003; I₅ OK 49-54; I₆ OK 56-59; I₇ 61-64 → F-INV-006; I₈ 66-73 → F-INV-001/004; I₉ 75-78 → F-INV-005; I₁₀ n.v.t.

### .claude/invariants.md
Gelezen: regels 1-252. Accuraat t.o.v. gelezen code (128-131, 121-141, 24-35, 75-80/94-97, 176/233-247). Geen zelfstandige vondsten.

### src/Invariants.gs
Gelezen: regels 1-761. I₁ OK 108-172/503-535/467-480 (naarCenten_ float-grens correct); I₂ OK 540-567 (T4); I₄ VONDST F-INV-003 (188-249, 431-439); I₆ OK 67-94 + F-INV-008; I₈ OK 569-577 (T5); I₉ VONDST F-INV-005 (142-171). Overig: checkKorGrens_/checkBtwTariefVerdacht_/detecteerOngekoppeldeBankuitgaven_ niet aangesloten → F-INV-007. Nevenobservatie: regel 756 capt op 21 i.p.v. 20 (cosmetisch).

### src/Boekingen.gs
Gelezen: regels 1-1481. I₁ OK 62-88/100-137; I₂ F-INV-002 (376-392); I₄ storno-suspensie OK 296-332; I₆ OK 1028-1039; I₈ F-INV-001 (regel 19 + 102); ontgrendel-suspensie OK 1271-1430; self-heal OK 1202-1243; I₉ F-INV-005 (1153-1179).

### src/Validaties.gs
Gelezen: regels 1-223. I₁-I₁₀: n.v.t., alleen formaat-validaties stamgegevens (BTW-nr 22-41, IBAN MOD-97 48-81 zelf gecontroleerd: correct, KvK 88-104, e-mail 110-125, postcode 132-147). Geen vondsten.

#### F-INV-001 [HOOG] src/Boekingen.gs:19
Quote: `const boekDatum = opt.datum instanceof Date ? opt.datum : new Date(opt.datum || new Date());`
Probleem: niet-ISO datum-string ('15-11-2025') ⇒ Invalid Date ⇒ alle drie I₈-gates falen stil (NaN-vergelijking regel 26 altijd false; jaarAlAfgesloten_(NaN) regel 42 matcht niets; T5 slaat zichzelf over via !isNaN-guard). Regel 102 schrijft de rauwe string; Sheets (NL-locale) interpreteert die als datum in het afgesloten jaar ⇒ boeking in gesloten periode zonder weigering. Post-hoc vangnet kapot (F-INV-004).
Fix: hard weigeren bij isNaN(boekDatum.getTime()) (DATUM_ONGELDIG); altijd boekDatum schrijven i.p.v. opt.datum.
Owner: Sam (dev)

#### F-INV-002 [HOOG] src/Boekingen.gs:380-384
Quote: `} catch (e) { Logger.log('updateGrootboekSaldo_: kon geen lock krijgen ...'); safeAuditLog_('GROOTBOEK LOCK', ...); return; }`
Probleem: silent return bij lock-timeout (en ontbrekend GROOTBOEKSCHEMA, 388-392) maakt de compensating-action-laag (150-181) onbereikbaar (vuurt alleen op thrown errors). Scenario: rij geschreven, debet bijgewerkt, credit-lock faalt ⇒ normale return ⇒ geen rollback/CORRUPT/fout ⇒ grootboek eenzijdig verschoven (I₂+I₃ gebroken) met alleen een audit-regel als spoor.
Fix: throwen bij lock-fail of statusobject dat maakJournaalpost_ op CORRUPT laat markeren.
Owner: Sam (dev)

#### F-INV-003 [MIDDEL] src/Invariants.gs:431
Quote: `function valideerInvariantsVoorFactuur_(ss, factuur) { valideerFactuurnummerUniek_(ss, factuur.factuurnummer); valideerBtwAansluiting_(`
Probleem: I₄-pre-write-gate is dode code (nul callers in src/; alleen valideerFactuurnummerUniek_ los aangeroepen, Triggers.gs:692). Tarief-domein {0,0.09,0.21} wordt bovendien niet gevalideerd (0.19 passeert). I₄ steunt volledig op dagelijkse post-hoc verifier ⇒ schendingen tot 24u onopgemerkt.
Fix: aanroepen in factuur-write-flow + tarief-domein afdwingen.
Owner: Sam (dev)

#### F-INV-004 [HOOG] src/FormeelBewijs.gs:421
Quote: `const aangemaakt = data[i][14];  // kolom: aangemaakt op`
Probleem: per sheet-schemas.md:114-115 is JOURNAALPOSTEN [14]=Notities (string), [15]=Aangemaakt op (Date); maakJournaalpost_ (Boekingen.gs:117-118) bevestigt. Check `aangemaakt instanceof Date` is met string altijd false ⇒ I₈-post-hoc-bewijs is permanente no-op: rapporteert "geldig" óók bij aantoonbare achteraf-boeking in gesloten periode (het gat van F-INV-001).
Fix: index [14] → [15] + regressietest die achteraf-boeking als schending verwacht.
Owner: Sam (dev)

#### F-INV-005 [MIDDEL] src/Invariants.gs:159 (+ src/Boekingen.gs:1170, 1178)
Quote: `const ambiguousParents = ['1400', '4100'];` … `// alleen waarschuwen via audit-log.`
Probleem: I₉ (universeel leaf-only) voor 1400/4100 niet afgedwongen én eigen fallbacks boeken erop (bepaalBtwVerkoopRekening_ → '4100', bepaalBtwVoorbelastingRekening_ → '1400' bij onherkend label); post-hoc verifier herkent alleen '000'-codes als parent ⇒ structureel en onzichtbaar geschonden.
Fix: fallbacks naar leaf (4110/1410) of axioma formeel amenderen met whitelist die ook in verifier staat.
Owner: Sam (dev)

#### F-INV-006 [MIDDEL] src/FormeelBewijs.gs:381-387
Quote: `// TODO audit-ronde 2 ...: I₇ blokkeert nu // niet in de factuur-creatie-flow — alleen post-hoc detectie.`
Probleem: I₇ (datum-nummer-monotonie) geen pre-write afdwinging; teller alleen creatie-monotoon. Tegenvoorbeeld: 12-06-2026→045, daarna factuur gedateerd 05-01-2026→046; alleen waarschuwing volgende dag.
Fix: pre-write check of gemotiveerde override in factuur-flow.
Owner: Sam (dev)

#### F-INV-007 [LAAG] src/Invariants.gs:263, 631, 688
Quote: `function checkKorGrens_(ss, jaaromzetTotaal) {` (idem checkBtwTariefVerdacht_, detecteerOngekoppeldeBankuitgaven_)
Probleem: drie beschermingsfuncties met caller-contracten in docstrings hebben nul aanroepen in src/ (alleen tests) ⇒ beloofde runtime-waarschuwingen bestaan niet voor de klant. controleerBewaarplichtAlert_ is wél aangesloten (Triggers.gs:1555).
Fix: aansluiten of verwijderen.
Owner: Sam (dev)

#### F-INV-008 [LAAG] src/Invariants.gs:78-93
Quote: `const data = sheet.getDataRange().getValues(); const target = String(factuurnummer).trim(); for (let i = 1; i < data.length; i++) {`
Probleem: uniciteitscheck read-then-write zonder lock; bij teller-corruptie + gelijktijdige submits passeren beide ⇒ duplicaat ondanks gate (dekt eigen doelscenario niet volledig).
Fix: check + append samen onder zelfde lock als volgendFactuurnummer_.
Owner: Sam (dev)

Status-tabel: I₁ OK | I₂ F-INV-002 | I₃ volgt I₂ | I₄ F-INV-003 | I₅ OK batch | I₆ OK + F-INV-008 | I₇ F-INV-006 | I₈ F-INV-001+004 | I₉ F-INV-005 | I₁₀ n.v.t. batch. Zwaartepunt: I₈-keten (poort én vangnet tegelijk uitgeschakeld).
