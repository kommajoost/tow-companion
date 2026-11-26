# Tactics pipeline

How `public/tactics/bronnen.json`, `lessen.json` and `principes.json` are made. Design: `docs/tactics/ontwerp.md`.

| Step | Command | Output |
|---|---|---|
| List all videos per first-round channel | `npm run tactics:list` | `tactics/cache/videos-<channel>.json` |
| Decide relevance and type | `npm run tactics:select` | `tactics/selectie.json` (hand decisions in `tactics/handmatig.json`) |
| Upload dates (slow, one video at a time) | `npm run tactics:dates [-- <id> ...]` | `tactics/cache/meta.json` |
| Write the sources file (first-round channels from the caches, round 3 from `tactics/ronde3/lijst.json` + `kanalen.json`) | `npm run tactics:sources` | `public/tactics/bronnen.json` |
| Glossary from the app data | `npm run tactics:glossary` | `tactics/glossary.json` |
| Name repair on a transcript | `npm run tactics:transcript -- --convert-only <id> ...` | `tactics/ruw/<id>.fixed.txt` |
| Validate and recount | `npm run tactics:build` (or `tactics:check`) | counts and status in `bronnen.json`, `public/tactics/themas.json` and `tags.json`, lessons per theme, sub-theme, phase and tag |
| Themes, sub-themes and tags via Codex | `npm run tactics:index` (see "Index") | `tactics/codex/index/`, then `-- --toepassen` writes `lessen.json` |
| Key principles above the lessons via Codex | `npm run tactics:principles` (see "Principles") | `tactics/codex/principes/`, `public/tactics/principes.json` |
| Key points per section (sub-theme) via Codex | `npm run tactics:keypoints` (see "Key points per section") | `tactics/codex/kernpunten/`, `public/tactics/kernpunten.json` |

`tactics/ruw/` and `tactics/cache/` are in `.gitignore`. Transcripts are never published.

## Getting a transcript (browser route)

yt-dlp cannot download subtitles on this machine: YouTube answers HTTP 429 unless yt-dlp can
impersonate a browser (needs `curl_cffi`). We do not install that to get around the refusal. Instead
the transcript is read the normal way, like a viewer, in the Browser pane:

1. Open `https://www.youtube.com/watch?v=<id>`, wait a few seconds, pause the video
   (`document.querySelector('video')?.pause()`).
2. Cookie dialog: choose "Alles afwijzen" (reject all). Sign-in wall, CAPTCHA or bot check: stop.
3. Expand the description, scroll to the visible "Transcript tonen" (Show transcript) button and
   click it with a real click (a JS `.click()` does not open the panel).
4. Read the segments: each `transcript-segment-view-model` gives a timestamp ("5:15") and its text.
   Check that the last timestamp is close to the video length.
5. Save as `tactics/ruw/<id>.txt`, one line per segment: `[m:ss] text`. That file is the raw copy.
6. Run `npm run tactics:transcript -- --convert-only <id>` to make `<id>.fixed.txt` with the names
   from `tactics/garbled.json` repaired. Add only garbled forms you have actually seen and whose
   context makes the right term certain.

Quotes in `lessen.json` are checked against `<id>.fixed.txt` by `tactics:build`: verbatim, at most
15 words, within 60 seconds of the timestamp. Processed videos are listed in `tactics/verwerkt.json`.

## Themes, sub-themes, tags and phases

Every lesson gets one `fase` (phase), one to three `themas` (themes, main theme first), per theme one
sub-theme in `subthemas` (same order, so `subthemas[0]` belongs to `themas[0]`) and two to six `tags`:

```json
"themas": ["chaff", "game-plan"], "subthemas": ["choosing-chaff", "tempo-trading"], "tags": ["delay", "redirect"]
```

The vocabulary lives in `tactics/themas.json` (themes with their sub-themes: id, name, one-line
description, order; plus the phases) and `tactics/tags.json` (tag groups, and per tag id, label,
group and synonyms). `tactics:build` copies both to `public/tactics/`, which the page, the MCP and the
AI tool read.

- **Phase**: when in the game the advice applies. `army-building` (what to take, how to build or
  equip a unit), `deployment` (where units go before the game), `movement` (manoeuvring, charging,
  redirecting, flank play during the game), `combat` (what happens in close combat), `magic-shooting`,
  `scenarios` (objectives and scenario-specific play). Pick the phase where you act on the advice.
- **Themes** (11): what the lesson is about, as a player would browse for it: Game plan, Deployment,
  Movement & charges, Chaff & screens, Infantry, Hammers & monsters, Characters, Magic, Shooting &
  terrain, Matchups, Scenarios & objectives. Give a theme only when the lesson is about it, not when
  it is mentioned in passing. Psychology (terror, fear, frenzy, leadership) has no theme: it is
  tagged, and the lesson sits where the player acts (frenzy bait under Chaff, a BSB under
  Characters). The old "Flanks" theme is the sub-theme Game plan / Flanks & centre.
- **Sub-themes** (3 to 8 per theme): the sections inside a theme on the page. Every lesson has exactly
  one sub-theme per theme it belongs to. Sub-theme ids are unique over all themes. Matchups has one
  sub-theme per opposing army that has enough lessons (vs Sky Lanterns, vs Grand Cathay, vs Beastmen,
  vs Bretonnia, vs Tomb Kings), plus vs Monsters & dragons, vs other armies and Picking fights.
- **Tags**: short index terms a player searches for: mechanics and rules (overrun, march block,
  stand and shoot, ward save), concepts (anvil, bait, screen, zoning) and unit types (heavy cavalry,
  monsters). Unit names stay in `units` and the army in `leger`. Synonyms map to one tag (search for
  "knights" finds `heavy-cavalry`); a term may belong to only one tag. Keep the list at roughly 60 to
  120 tags, each used at least 3 times; fold a rare tag into a broader one as a synonym.
- Growing the vocabulary: a new theme or sub-theme is fine when a round brings at least three lessons
  that fit nothing existing. `tactics:build` warns (does not fail) for a theme, sub-theme or tag under
  3 lessons, a theme above about 130 lessons, a theme with fewer than 3 or more than 8 sub-themes and
  a lesson with fewer than 2 tags. It fails on an unknown phase, theme, sub-theme or tag, a sub-theme
  under the wrong theme, `subthemas` not matching `themas`, more than 3 themes or 6 tags, a missing
  `tags` list, a synonym claimed by two tags, and a leftover `onderwerp` field.

## Index (themes, sub-themes and tags via Codex)

`npm run tactics:index` asks Codex to assign themes, sub-themes and tags, 40 lessons per call. Codex
gets the rules, the vocabulary and per lesson id, title, text, why, phase, army and units; it answers
`{ lessen: [{ id, themas: [{ thema, subthema }], tags }] }` only. It runs with `--ignore-user-config`,
`--ephemeral`, sandbox `read-only`, in an empty temporary folder (not the repo) and with
`--output-schema` (a JSON Schema with the allowed ids, so a sub-theme can only come with its own
theme). Model `gpt-6.1-sol`; effort `medium` by default, the first full index ran on `high`
(`TACTICS_INDEX_EFFORT=high`).

| Step | Command |
|---|---|
| All lessons without a valid index and without an answer in `tactics/codex/index/` | `npm run tactics:index` |
| Only some lessons (also re-asks them) / every lesson again | `-- --ids a,b,c` / `-- --alles` |
| Batch size, at most N batches, show the prompt only | `-- --batch 30`, `-- --max 2`, `-- --droog` |
| Write the answers into `public/tactics/lessen.json`, then build | `npm run tactics:index -- --toepassen`, `npm run tactics:build` |

Every answer is checked against the vocabulary; an invalid or missing lesson is asked once more with
the reason, and if it is still invalid it is listed under `open` in its batch file. Fill those in by
hand in `tactics/codex/index/hand.json` (`{ "<id>": { "themas": [{ "thema", "subthema" }], "tags": [] } }`),
which always wins over Codex; hand corrections from a spot-check go there too. Each batch is written
to `tactics/codex/index/batch-NNN.json` as soon as it is done, so an interrupted run continues where it
stopped. The runner stops at once on a usage limit, login error or unknown model, and after 3 failed
batches in a row; it never runs two Codex calls at once. Afterwards the temporary folder must be empty
and `git status` must show no new changes in `tactics/` or `public/` (outside `tactics/codex/index/`);
anything else is reverted with a copy in `tactics/codex/teruggedraaid/`. New lessons from the
extraction route already come with sub-themes and tags (see `INSTRUCTIES.md`); `tactics:index` is for
re-indexing after a vocabulary change or for lessons that came back with too few tags.

One video at a time, with a pause between videos. In the first round a 28-minute video took about
3 minutes to fetch and 10 to 15 minutes to read and turn into lessons.

## Principles

A layer above the lessons, so a player can start from a top 10 instead of hundreds of specific tips.
A **principle** is one overarching piece of advice that several players give independently: a short
claim (`titel`), one or two sentences of explanation (`tekst`) and the lessons that back it. Where
players clearly disagree, it is a **debate** (`soort: "debat"`) with each side (`kanten`: `standpunt`
plus its lessons). Titles and texts are AI summaries of the lessons under them: no new claims, no
rules knowledge of their own, every claim traceable to those lessons. The page marks them as a
summary; the MCP tells clients to cite the lessons, not the principle.

Ranking is evidence, not model opinion. Per principle the script counts the supporting lessons and
the **distinct channels** among their sources (lesson, `bronnen[].bronId`, `bronnen.json` `kanaalId`).
A principle exists only with at least 3 lessons from at least 2 channels; it is ranked by channels,
then lessons. Lists in `public/tactics/principes.json`:

- `top10`: the 10 best-backed general principles (army `null`, not a debate): the Essentials view;
- `debat`: the general debates;
- `perThema`: per theme at most 5 general principles whose theme is that theme (shown above its
  sub-themes);
- `perLeger`: per army all principles specific to that army (playing it or facing it).

```json
{ "bijgewerkt": "2026-11-26", "drempel": { "lessen": 3, "kanalen": 2 },
  "principes": [{ "id", "titel", "tekst", "soort": "principe|debat", "thema", "leger": null,
    "aantalLessen", "aantalKanalen", "kanalen": [], "lessen": [], "kanten?": [{ "standpunt", "aantalLessen", "aantalKanalen", "lessen" }] }],
  "top10": [], "debat": [], "perThema": {}, "perLeger": {} }
```

| Step | Command |
|---|---|
| Ask Codex for every scope without an answer, then assemble | `npm run tactics:principles` |
| Only some scopes (also re-asks them) / all again | `-- --scope thema-chaff,leger-skaven` / `-- --opnieuw` |
| Show the prompt and schema of one scope | `-- --droog thema-magic` |
| Assemble only (after editing `hand.json`) | `npm run tactics:principles -- --samenstellen` |

**Codex step.** One call per theme (all lessons with that theme, army lessons included) and one per
army that can reach the threshold at all. Codex gets per lesson id, title, text, why, when not,
sub-theme or themes, tags, army and channel names, and clusters lessons that give the SAME advice
(not just the same topic) into principles or debates. Same set-up as `tactics:index`: model
`gpt-6.1-sol`, effort `high` (`--effort` or `TACTICS_PRINCIPLES_EFFORT`), `--ignore-user-config`,
`--ephemeral`, sandbox `read-only` in an empty temporary folder, `--output-schema` with the lesson ids
of the call as an enum. Each answer goes straight to `tactics/codex/principes/<scope>.json`, so a
stopped run continues where it was; it stops at once on a usage limit, login error or unknown model
and after 3 failed calls in a row, and never runs two calls at once. When the lessons of a scope
change, assembling warns that the scope is stale (re-ask it with `--scope`).

**Assembling (deterministic).** Duplicates across scopes are merged: same army (or both general), both
principles, and at least 60% of the smaller one's lessons in the other: the bigger one stays with the
lessons of both, listed under the theme where most of its lessons have their main theme. Then the hand
corrections, the counts, the threshold and the ranking. What was merged or fell below the threshold is
in `tactics/codex/principes/samengesteld.json`.

**Hand corrections** live in `tactics/codex/principes/hand.json` and always win, so a rerun keeps them:

```json
{ "nietSamenvoegen": [["a", "b"]],
  "samenvoegen": [{ "in": "a", "uit": ["b"], "thema": "chaff" }],
  "weg": ["c"],
  "wijzig": { "d": { "titel": "...", "tekst": "...", "thema": "...", "lessenErbij": [], "lessenEraf": [] } },
  "nieuw": [{ "id", "titel", "tekst", "soort", "thema", "leger", "lessen", "kanten" }] }
```

**Checks.** `tactics:build` validates `principes.json` (via `tactics/principes-lib.mjs`, shared with the
script): unique kebab-case ids, every lesson id exists, a debate has at least 2 sides and every lesson
on a side, no em or en dashes, at most 2 sentences, known theme and army, and the threshold. It
recounts lessons and channels and redoes the lists; `tactics:check` fails when the file differs from
that recount. A lesson change that drops a principle below the threshold fails the build: re-run
`npm run tactics:principles` (or fix it in `hand.json`).

## Key points per section

A theme opens as sections (its sub-themes), some with 30 or more lessons. Each section starts with its
3 to 5 **key points**: the advice that several of its lessons give, so a player can learn the section
without reading every lesson. A key point is a short claim (`titel`), one sentence (`tekst`) and the
lessons of that section that back it. Like principles, titles and texts are AI summaries of those
lessons (no claims of their own, no rules knowledge); the page says so in the detail view.

Ranking is evidence: per key point the script counts lessons and distinct channels (`tel` from
`tactics/principes-lib.mjs`) and ranks by channels, then lessons. Rules (`tactics/kernpunten-lib.mjs`):
at least 2 lessons; points from 2 or more channels first, a one-channel point only to fill a section up
to 3 (shown with its "1 ch" count); at most 3 for a section under 10 lessons, 4 under 16, else 5; a
section under 4 lessons gets none. A key point that gives the same advice as a principle links to it
(`principeId`), takes its title (and its text when that is one sentence) and the principle's lessons in
that section, minus lessons the principles review removed (`lessenEraf` in the principles `hand.json`).

```json
{ "bijgewerkt": "2026-11-26", "drempel": { "lessen": 2, "sectie": 4 },
  "perSubthema": { "<sub-theme id>": [{ "id", "titel", "tekst", "lessen": [], "nLessen", "nKanalen", "kanalen": [], "principeId?" }] } }
```

| Step | Command |
|---|---|
| Ask Codex for every section without an answer, then assemble | `npm run tactics:keypoints` |
| Only some sections (also re-asks them) / all again | `-- --subthema screens,reading-the-enemy` / `-- --opnieuw` |
| Show the prompt and schema of one theme | `-- --droog game-plan` |
| Assemble only (after editing `hand.json`) | `npm run tactics:keypoints -- --samenstellen` |

**Codex step.** One call per theme with the sections that need an answer (11 calls for the whole
library, about 2 to 6 minutes each). Per section Codex gets its lessons (id, title, text, why, when
not, tags, army, channel names) and the principles that cover at least 2 of its lessons; it answers
`{ secties: { <sub-theme id>: [{ titel, tekst, lessen, principe }] } }`, 3 to 6 candidates per section.
The `--output-schema` has one property per section with that section's lesson ids as an enum, so a key
point can only use lessons of its own section. Same set-up and safety as the principles: `gpt-6.1-sol`,
effort `high` (`--effort` or `TACTICS_KEYPOINTS_EFFORT`), read-only sandbox in an empty temporary
folder, one call at a time, a stop on a usage limit, login error or unknown model and after 3 failed
calls in a row. Each section is cached in `tactics/codex/kernpunten/<sub-theme>.json` (with a hash of its
lessons and principles; assembling warns when a section is stale).

**Assembling (deterministic).** Per section: drop lessons no longer in the section, merge two
candidates when 60% of the smaller one's lessons are in the other, apply the hand corrections, link
principles (Codex named one and at least 60% of the key point's lessons are in it, or 60% overlap both
ways), count, rank and pick. What was merged, linked, dropped or kept with one channel is in
`tactics/codex/kernpunten/samengesteld.json`.

**Hand corrections** live in `tactics/codex/kernpunten/hand.json`, per sub-theme id, and always win:

```json
{ "<sub-theme id>": {
  "nietSamenvoegen": [["a", "b"]],
  "samenvoegen": [{ "in": "a", "uit": ["b"] }],
  "weg": ["c"],
  "wijzig": { "d": { "titel": "...", "tekst": "...", "lessenErbij": [], "lessenEraf": [], "principe": "id or null" } },
  "nieuw": [{ "id", "titel", "tekst", "lessen": [] }] } }
```

**Checks.** `tactics:build` validates `kernpunten.json`: known sub-theme ids, every lesson exists and
belongs to that sub-theme, at least 2 lessons, at most 5 key points, no section under 4 lessons, a
known `principeId`, kebab-case ids, no em or en dashes, one sentence. It recounts and re-sorts;
`tactics:check` fails when the file differs from that recount. If a lesson leaves its sub-theme, the
build fails: re-run `npm run tactics:keypoints -- --subthema <id>` (or fix it in `hand.json`).

## Codex route (round 2 onwards)

The reading work runs on the OpenAI Codex CLI (`codex exec`, logged in with the ChatGPT
subscription), not on Claude. Codex gets `tactics/codex/INSTRUCTIES.md` (the lesson rules, the output
schema and two example lessons) plus, per video, the video data, the phases, the themes with their
sub-themes, the tags, the army slugs, the unit names and an index of all existing lessons, so it can
add a source to an existing lesson instead of writing a duplicate. Codex answers themes as
`[{ thema, subthema }]`; the runner checks them and the tags against the vocabulary (a lesson without
a valid theme is dropped, unknown tags are left out) and stores `themas` + `subthemas` + `tags`. The
Codex start and the git guard are shared with the indexer in `tactics/codex/cli.mjs`.

| Step | Command | Output |
|---|---|---|
| All videos in `tactics/ronde2-tactics.json` with a transcript and no output yet | `npm run tactics:codex` | `tactics/codex/uit/<id>.json`, `tactics/codex/log.json` |
| Only some videos / at most N | `npm run tactics:codex -- <id> <id>` / `-- --max 3` | idem |
| Another video list (JSON array with a `videoId` per item, every video already in `bronnen.json`), e.g. round 3 | `npm run tactics:codex -- --lijst tactics/ronde3/lijst.json` | idem |
| Calibration on an already processed video (its own lessons are left out of the index) | `npm run tactics:codex -- --kalibratie <id>` | `tactics/codex/kalibratie/<id>.json` |
| Show the prompt without running Codex | `npm run tactics:codex -- --droog <id>` | prompt in the temp folder |
| Merge into the lessons file, mark processed, build and check | `npm run tactics:merge` (`-- --droog` to preview) | `public/tactics/lessen.json`, `tactics/verwerkt.json`, `tactics/codex/samengevoegd.json` |

Model: `gpt-6.1-sol`, effort `high` (change with `--model` / `--effort` or `TACTICS_CODEX_MODEL` /
`TACTICS_CODEX_EFFORT`). The runner starts Codex with `--ignore-user-config` (no MCP servers or
plugins), `--ephemeral` (no session history per video), sandbox `workspace-write` and the repo as
working folder. Per video the runner then checks:

1. the output file exists and is valid JSON (otherwise one retry, then the video is skipped);
2. `git status` shows no other new changes. Anything else Codex touched is reverted (a copy goes to
   `tactics/codex/teruggedraaid/`) and the video counts as failed. **Do not edit files in the repo
   while a run is going**: the runner cannot tell your edits from Codex's and would revert them
   (with a copy). The transcript fetcher's files (`tactics/ruw/`, `tactics/ophalen-log.json`,
   `tactics/garbled.json`) are excluded;
3. every quote the same way as `tactics:build`. A lesson whose main quote is not verbatim is dropped,
   a failing extra quote is left out, a verbatim quote with a wrong timestamp is moved to the line
   where it starts. Unknown units are left out, unknown phases/armies drop the lesson. Everything
   dropped or corrected is listed under `controle` in the output file.

The runner stops after 3 failed videos in a row, and at once on a usage limit, login error or
unknown model. It never runs two videos at once. `uit/<id>.json` already has the shape of
`lessen.json` (`nieuw`: lessons; `aanvullingen`: an extra source for an existing lesson, plus text for
`waarom`/`voorbeeld`/`wanneerNiet` only where that field was null). The merge appends new lessons,
adds sources to existing ones (at most 3 quotes per lesson: extra quotes of the new source go first,
then extra quotes of older sources; a lesson with 3 sources gets no more) and restores all files if
`tactics:build` or `tactics:check` fails. Running it twice does nothing the second time.

Checking a round: read `tactics/codex/log.json` (status, seconds, tokens, commands Codex ran, what
was dropped), spot-check a few `uit/*.json` against the video, then `npm run tactics:merge`. A failed
video has no `uit/` file and is picked up again by the next `npm run tactics:codex`. To redo a video,
delete its `uit/` file before merging.
