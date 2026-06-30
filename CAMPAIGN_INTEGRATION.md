# Campaign integration (De Grensvorsten) — changelog & rollback

A **Campaign** tab that couples tow-companion to the sibling app **De Grensvorsten** (a TOW
campaign/map app on the **same Komma AI Supabase project**). Built additively and isolated so it can
be removed cleanly. Every change to existing files is marked with the comment **`CAMPAIGN INTEGRATION`**
(grep that marker to find them all).

Status: **Phase A + B + C**.
- A — pick your faction → see territory, gold, fame, battles (read-only).
- B — your phase points budget + the army-list slots your buildings unlock + link a saved list.
- C — for each battle, the scenario the terrain frames + respond (defend/yield) + record the result back.

## Data it touches
- **Reads** via existing De Grensvorsten RPCs (SECURITY DEFINER, granted to anon) on the shared Komma AI
  Supabase: `towc_get_spel()` (state) and `towc_get_map()` (hex terrain).
- **Writes** via existing De Grensvorsten RPCs only — `towc_spel_reageer()` (defender's defend/yield)
  and `towc_spel_uitslag()` (record a battle result; winner + spoils computed server-side). These are
  De Grensvorsten's own RPCs; **no new tables, no schema changes, no migrations from this app.**
- Reads `tow:lists` (your saved lists, to link one) — **never writes** it.
- **localStorage**: two new keys `tow:campaign-player` (your faction) + `tow:campaign-list` (linked list id).
- Existing tables (`tow_lists`, `tow_games`, `tow_feedback`) and all existing behaviour: **untouched**.

## New files (delete these to remove the feature)
- `src/lib/campaign.ts` — read-only data layer (`fetchCampaign()` → `towc_get_spel`).
- `src/campaign.tsx` — `CampaignProvider` + `useCampaign()` (holds state + the chosen faction; lazy-loads).
- `src/components/campaign/CampaignMode.tsx` — the Campaign tab UI (the whole `src/components/campaign/` folder is new).

## Modified files (revert the `CAMPAIGN INTEGRATION`-marked lines)
- `src/App.tsx` — import `CampaignProvider` + wrap `<AppShell/>` with it (inside `ListSyncProvider`).
- `src/design/icons.tsx` — add `'campaign'` to `IconId`, a `CampaignIcon` component, and a `campaign:` entry in `ICONS`.
- `src/components/AppShell.tsx` — import `CampaignMode`; add `'campaign'` to the `Tab` type; add a `TABS` entry; add a `tab === 'campaign'` render branch.
- `src/components/NavRail.tsx` — import `CampaignIcon`; add `'campaign'` to `NavTab`; add a `SECTIONS` entry.

## Full rollback (≈2 minutes)
1. Delete the 3 new files above (and the now-empty `src/components/campaign/` folder).
2. In the 4 modified files, remove every line/block tagged `CAMPAIGN INTEGRATION` (revert the `Tab`/`NavTab`/`IconId` unions back to without `'campaign'`).
3. `npm run typecheck` to confirm it's clean.
4. (Optional) clear the `tow:campaign-player` and `tow:campaign-list` localStorage keys.

No server-side changes were made, so nothing needs to be undone on Supabase.
