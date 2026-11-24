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
| Validate and recount | `npm run tactics:build` (or `tactics:check`) | counts and status in `bronnen.json`, `public/tactics/themas.json`, lessons per theme and phase |

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

## Themes and phases

Every lesson gets one `fase` (phase) and one to three `themas` (themes). The vocabulary lives in
`tactics/themas.json` (id, name, one-line description, order); `tactics:build` copies it to
`public/tactics/themas.json`, which the page and the AI tool read. The Lessons page opens on the
themes; inside a theme the lessons are grouped by phase.

- **Phase**: when in the game the advice applies. `army-building` (what to take, how to build or
  equip a unit), `deployment` (where units go before the game), `movement` (manoeuvring, charging,
  redirecting, flank play during the game), `combat` (what happens in close combat), `magic-shooting`,
  `scenarios` (objectives and scenario-specific play). Pick the phase where you act on the advice.
- **Themes**: what the lesson is about, as a player would browse for it. Read the title, text, why
  and example. Give a theme only when the lesson is about it, not when it is mentioned in passing:
  "Flanks" means the lesson is about winning, using or defending a flank of the board (not the flank
  of a single unit); "Chaff" means cheap units that redirect, delay, screen or distract. Order the
  themes by weight, main theme first.
- Keep the theme list short (now 8). A new theme is fine when the round brings at least three lessons
  that fit no existing theme; `tactics:build` warns (does not fail) while a theme has fewer than 3
  lessons. Otherwise use the broader theme. Names short and plain, descriptions one factual line.
- `tactics:build` fails on an unknown phase or theme, on fewer than 1 or more than 3 themes, and on a
  leftover `onderwerp` field (replaced by `fase` + `themas`).

One video at a time, with a pause between videos. In the first round a 28-minute video took about
3 minutes to fetch and 10 to 15 minutes to read and turn into lessons.

## Codex route (round 2 onwards)

The reading work runs on the OpenAI Codex CLI (`codex exec`, logged in with the ChatGPT
subscription), not on Claude. Codex gets `tactics/codex/INSTRUCTIES.md` (the lesson rules, the output
schema and two example lessons) plus, per video, the video data, the themes and phases, the army
slugs, the unit names and an index of all existing lessons, so it can add a source to an existing
lesson instead of writing a duplicate.

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
