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
| Validate and recount | `npm run tactics:build` (or `tactics:check`) | counts and status in `bronnen.json` |

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

One video at a time, with a pause between videos. In the first round a 28-minute video took about
3 minutes to fetch and 10 to 15 minutes to read and turn into lessons.
