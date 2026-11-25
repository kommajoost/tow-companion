# Tactics pipeline

How `public/tactics/bronnen.json` and `lessen.json` are made. Design: `docs/tactics/ontwerp.md`.

| Step | Command | Output |
|---|---|---|
| List all videos per first-round channel | `npm run tactics:list` | `tactics/cache/videos-<channel>.json` |
| Decide relevance and type | `npm run tactics:select` | `tactics/selectie.json` (hand decisions in `tactics/handmatig.json`) |
| Upload dates (slow, one video at a time) | `npm run tactics:dates [-- <id> ...]` | `tactics/cache/meta.json` |
| Write the sources file | `npm run tactics:sources` | `public/tactics/bronnen.json` |
| Glossary from the app data | `npm run tactics:glossary` | `tactics/glossary.json` |
| Name repair on a transcript | `npm run tactics:transcript -- --convert-only <id> ...` | `tactics/ruw/<id>.fixed.txt` |
| Validate and recount | `npm run tactics:build` (or `tactics:check`) | counts and status in `bronnen.json`, `public/tactics/themas.json` and `tags.json`, lessons per theme, sub-theme, phase and tag |
| Themes, sub-themes and tags via Codex | `npm run tactics:index` (see "Index") | `tactics/codex/index/`, then `-- --toepassen` writes `lessen.json` |

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
