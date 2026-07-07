# Companion ↔ De Grensvorsten — koppeling: handover

**Datum:** 2026-07-05 · **Companion-versie:** v0.1.138 · **Status:** koppeling LIVE, twee kleine vervolgtaken (deep-link + verifiëren).

Dit document beschrijft de koppeling tussen **Old World Companion** (deze repo, `D:\CLAUDE CODE\tow-companion`) en de campagne-app **De Grensvorsten** (`D:\CLAUDE CODE\The Old World Campaign\site`, prod = grensvorsten.vercel.app). Beide draaien op **hetzelfde Supabase-project** `rbjzooxbnrfuwtnwczih`.

---

## 1. Het idee

Spelers bouwen hun **campagne-armylists in de Companion**, maar die lijst moet de campagne-regels van dat moment volgen:
- de **puntencap van de huidige fase** (500 → 2000, +250/fase);
- het **compositie-pakket van de fase** (fase 1-2 = Battle March; fase 3+ = Combined Arms / Grand Melee);
- de **building-perks + item-allowance** die de speler in de campagne heeft verdiend.

En omgekeerd: de **units uit de Companion-lijst voeden de campagne** — De Grensvorsten heeft sinds v120 een veteranen-systeem **per unit** (XP, gekozen abilities, littekens). De campagne leest de units uit de Companion-lijst en houdt ze battle-na-battle bij. De lijst is dus de brug: hij vertaalt campagne-context naar een legale TOW-lijst, en levert de units terug voor de veteranen-laag.

Kernprincipe (campagne-kant, verzacht 05-07-2026): campagne-progressie mág de tafel beïnvloeden, maar **begrensd** — géén roster-unlocks meer (TOW kent die niet), alleen perks + de +20 item-allowance. De Companion dwingt daarom **geen** wizard-level/unit-slot-bonussen meer af.

---

## 2. Server-contract (staat live, anon-executable)

Zelfde Supabase-client als de list-sync. Twee RPC's:

```ts
// Koppelen: valideert de code, legt optioneel de list-sync-key vast op de speler.
supabase.rpc('towc_companion_koppel', { p_code: 'GQZX3K', p_sync_key: <deriveKey(pass)> | null })
// Context verversen (zelfde response-vorm, zonder key-mutatie):
supabase.rpc('towc_companion_context', { p_code: 'GQZX3K' })
```

**Response (getest):**
```json
{
  "ok": true,
  "fase": 4, "week": 2,
  "puntenCap": 1250,
  "compositie": ["combined-arms", "grand-melee"],   // fase 1-2 → ["battle-march"]
  "itemAllowanceBonus": 20,                          // 0, of 20 bij een Armoury/Quartermaster-gebouw
  "speler": { "id": "p0", "naam": "Joost", "kleur": "#d4a23a", "factie": "dark-elves", "alliantie": "stoppen" },
  "rosterOpties": [ { "id": "wizard-tower", "naam": "Wizard's Tower", "level": 2, "effect": "Perk: Arcane Focus — once per battle, re-roll one casting roll…" } ],
  "tafelTactiek": [ { "id": "ambush-den", "naam": "Ambush Den", "level": 1, "effect": "Tactic: ambush deployment…" } ],
  "events": [ { "id": "comet-scar", "details": { "hex": "6,10" } } ]
}
```
Foute code → `{ "ok": false, "fout": "ONBEKENDE_CODE" }`.

De **koppelcode** (6 tekens, geen 0/O/1/I) staat per speler in de campagne-app onder **Army → Companion link**, met een kopieerknop en een **"Open Old World Companion"-knop** (zie §5). Codes horen bij de spelers van de huidige game; na een game-reset opnieuw koppelen.

---

## 3. Wat er al gebouwd is (Companion-kant, in deze repo)

- **`src/lib/campaign.ts`** — RPC-wrappers (`koppelCampagne`, `versCampagneContext`), cache (`tow:campaignCtx`), code (`tow:campaignCode`), `campaignPointsCap(ctx)`. De oude `campaignModifiers`/`wizardLevelBonus`/unlock-booleans zijn **verwijderd** (unlocks bestaan niet meer). `CampaignContext` heeft `compositie: string[]` en `itemAllowanceBonus: number`.
- **`src/components/SettingsMode.tsx`** — sectie **Campaign**: koppelen (input + "Link campaign"), refresh, unlink; sync-key wordt alleen meegestuurd als list-sync aanstaat (`deriveKey` uit `tow:syncPass`).
- **`src/components/game/NewListSetup.tsx`** — **"Campaign list"-toggle**: locket de punten op de fase-cap én de **composition-rule** op het fase-pakket (fase 1-2 → `battle-march`; fase 3+ → keuze `combined-arms`/`grand-melee`, uit `ctx.compositie`). Zet campagne-velden op de lijst: `campaign`, `campaignSpeler`, `campaignNaam`, `campaignFase`.
- **`src/components/game/BuilderWorkspace.tsx`** — campagne-balk (naam · fase · cap · pakket) met een gouden mismatch-waarschuwing als `list.rule` niet in `ctx.compositie` zit; `validate(list, getUnit, itemsData, { pointsCap })` (alléén de cap wordt afgedwongen); **"Perks"-paneel** met roster/tactiek-effecten + events + de Quartermaster-regel bij `itemAllowanceBonus > 0`.
- **`src/lib/owbBuilder.ts`** — `validate` accepteert `{ pointsCap }`; de wizard-level-verhoging is eruit (standaard Grand Melee-caps).

De **units-sync-knop zit NIET hier** maar in de campagne-app (Army → Veterans → "Sync units from Companion list"). Die leest `tow_lists` op de `companion_sync_key` en pakt de meest recente lijst met `campaign:true` + `campaignSpeler = <speler>`. **Voorwaarde: list-sync moet aanstaan** in de Companion, anders staat de lijst niet in `tow_lists` en vindt de campagne 'm niet.

---

## 4. Volledige spelersflow (om te testen)

1. **Companion → Settings → list-sync AAN** (sync-wachtwoord instellen). Zonder dit wordt de lijst niet naar de cloud gepusht.
2. **Companion → Settings → Campaign → koppelcode invoeren** (uit de campagne-app, Army → Companion link). Bij succes zie je speler + "Phase X · Y pts".
3. **Companion → nieuwe lijst → "Campaign list"-toggle aan**: punten + compositie staan vast op de fase; bouw de lijst.
4. **Campagne-app → Army → Veterans → "Sync units from Companion list"**: je units verschijnen als veteranen.
5. **Na een battle** (campagne-app → Battles → "Report result"): per unit fought/survived/MVP → XP; bij drempels kies je abilities onder Veterans.

---

## 5. Vervolgtaak 1 — deep-link (campagne-kant is al klaar)

De campagne-app heeft nu een knop **"Open Old World Companion"** die opent:
```
https://tow-companion.vercel.app/?campaign=<KOPPELCODE>
```
**De Companion moet die query nog honoreren.** Gewenst gedrag bij laden met `?campaign=<CODE>`:
1. Spring naar **Settings** (of toon een compacte koppel-prompt).
2. **Vul de code voor** in het Campaign-input (uppercase, 6 tekens) — of koppel meteen automatisch als er al een list-sync-pass is.
3. **Ruim de query op** (history.replaceState) zodat een refresh niet opnieuw triggert.

Implementatiehint: lees `new URLSearchParams(location.search).get('campaign')` in `AppShell`/`App` op mount; is er een code én is de app nog niet gekoppeld (`getCampaignCode()` leeg), zet dan de tab op `settings` (usePersistentState `tow:tab`) en geef de code door aan `SettingsMode`'s CampaignSection als initiële input. Klein en zelfstandig.

---

## 6. Deploy — OPGELOST (05-07-2026): repo linkt nu aan het `oldworldcompanion`-project ✅

**Wat er mis was.** Er waren **twee losse Vercel-projecten**: de repo was gelinkt aan project `tow-companion`, maar de spelers gebruiken **`oldworldcompanion.vercel.app`**, dat bij een ápart project `oldworldcompanion` hoort. Elke `vercel --prod` ging dus naar het verkeerde project t.o.v. de speler-URL, en `oldworldcompanion.vercel.app` moest steeds handmatig cross-gealiast worden (foutgevoelig, kostte een sessie: app bleef op v137 zonder koppeling hangen).

**De permanente fix.** De repo is nu **gelinkt aan het `oldworldcompanion`-project** (`vercel link --project oldworldcompanion`; `.vercel/project.json` → `prj_7sGONBCgstbsrTHLzj8pXaKyPikm`). Daardoor deployt `vercel --prod` naar hetzelfde project als de speler-URL, en **`oldworldcompanion.vercel.app` volgt elke deploy automatisch** — geen alias-commando meer nodig. Geverifieerd: een deploy naar v0.1.139 liet oldworldcompanion.vercel.app vanzelf op 139 komen.

**Voorwaarde waarom dit veilig kon:** de Companion heeft **geen env-vars en geen `api/`-functions** — Supabase-URL + publishable key staan hardcoded in `src/lib/supabase.ts`. De build heeft dus nul project-env-afhankelijkheid.

**Deployen is nu simpelweg:**
```bash
npm run build
vercel --prod --yes
# verifieer (optioneel):
JS=$(curl -s "https://oldworldcompanion.vercel.app/?cb=$RANDOM" | grep -oE "assets/index-[A-Za-z0-9_-]+\.js" | head -1)
curl -s "https://oldworldcompanion.vercel.app/$JS" | grep -oE "0\.1\.[0-9]+|towc_companion_koppel"
```
Bump `package.json` version bij elke inhoudelijke deploy zodat de PWA-updateprompt afgaat en de speler het nieuwe nummer ziet. Het oude `tow-companion`-project (+ z'n `tow-companion*.vercel.app`-domeinen) is nu **wees/ongebruikt** — negeren.
De Companion is een **PWA** → eindgebruiker moet de app volledig sluiten/updaten (of de "A new version is ready"-prompt volgen) om de nieuwe build te krijgen; check `Settings → Version` (moet ≥ v0.1.138 zijn).

---

## 7. Losse eindjes / mooi-om-te-hebben

- **Battle-sheet-koppeling** (later): de campagne bewaart per speler de `companion_sync_key`, dus de campagne kán straks de campagne-lijsten van een speler tonen bij de pre-battle sheet (units + magic items). Nog niet gebouwd.
- De 27 **campagne-loot-items** (échte TOW common items ≤30 pt) leven in de campagne-DB (`towc_item_def`) en worden binnen de normale magic-item-allowance gedragen; de Companion hoeft daar (voorlopig) niets voor te doen behalve de +20 Quartermaster-regel tonen (al gedaan).
