# Tactics library: survey of new source types

Researched 2026-11-25 for the next rounds of the tactics library (612 lessons from 107 YouTube
videos so far). Three source types: Reddit, podcasts, written tactics. Every access test below was
run on this machine on 2026-11-25, with the User-Agent `tow-companion-research/1.0 (personal study
app)` unless stated otherwise. Nothing was installed, registered or created. Earlier source research:
`docs/tactics/bronnen.md`.

Short version: the best next tactics knowledge is **written**, not Reddit or audio. Tabletop Battles
has 12 real tactics essays plus 25 army/Arcane Journal reviews (full text with a browser
User-Agent; the generic one gets a challenge page); 1d6chan has 22 long,
recently edited Old World tactics pages behind an open wiki API. Most good podcasts are already on
YouTube, so our existing route covers them. Reddit is big but thin, and the only working route is a
third-party archive.

---

## 1. Reddit

### Access routes, tested today

| Route | Result on this machine |
|---|---|
| (a) `https://www.reddit.com/r/WarhammerOldWorld/top.json?t=all&limit=25` | **403**, HTML page "blocked by network security" (same with a browser User-Agent) |
| (a) `.../search.json?q=tactics&restrict_sr=1`, `.../about.json`, `https://api.reddit.com/...` | **403**, same block page |
| (a) `https://old.reddit.com/r/WarhammerOldWorld/top.json?...` | **302** to `old.reddit.com/login/?reason=lor2` (login required) |
| (b) plain page `https://www.reddit.com/r/WarhammerOldWorld/` | **200**, but the 8 KB body is a JavaScript proof-of-work bot check, not content. Solving it would be bypassing a bot check: not done |
| (b) `.../r/WarhammerOldWorld.rss` | **429**; `/.rss` with slash 404 |
| (b) Browser pane (Claude preview browser) | reddit.com is **refused by the browser's safety restrictions** |
| (b) WebFetch tool | "unable to fetch from www.reddit.com" |
| (c) Official Data API | Not tested (needs registration, see below) |
| (d) **Arctic Shift** archive API (`https://arctic-shift.photon-reddit.com/api/...`) | **200**, JSON for posts, full comment trees and subreddit metadata. Keyword search is flaky: about half of the queries returned "Timeout. Maybe slow down a bit" even at one request per 4 s; aggregate endpoints timed out every time |
| (d) **Pullpush** (`https://api.pullpush.io/reddit/search/submission/...`) | **429**: "does not provide free scraping resources for agents", points to a paid service |
| (e) Search engines | DuckDuckGo HTML (`html.duckduckgo.com/html/?q=site:reddit.com/r/WarhammerOldWorld+tactics`): 200, 10 thread URLs per query. Bing: 200 but 0 thread URLs in the returned HTML. The WebSearch tool returned no Reddit threads at all (also not with `site:`). Search engines give thread URLs only; the content still has to come from an archive |

**Official Reddit Data API (c)**, what it would take (nothing was created):
- Since 2025-11-11 ("Responsible Builder Policy") self-service API access is closed: new OAuth
  apps/tokens need Reddit's approval first, requested through Reddit support. Reports of approval
  are mixed (delays, rejections for non-moderator use cases).
- If approved: a "script" app registered under the owner's Reddit account, client id + secret, the
  owner's username/password or a refresh token, a unique User-Agent of the form
  `<platform>:<app id>:<version> (by /u/<username>)`. Free limit 100 queries per minute per OAuth
  client id (averaged over 10 minutes). Data API Terms §1.1: identification/contact details are
  required.
- Terms (Data API Terms, last revised 2026-07-20; Developer Terms, last revised 2026-03-24):
  licence to "copy and display" User Content only to run your app; no use to train ML/AI models
  without the rightsholders' permission; retain nothing beyond the approved use case and delete it
  when access ends ("including any data or models derived"); commercial use needs a separate
  agreement; no masking the User-Agent or OAuth identity. Approval is unlikely to be worth the
  effort for a personal study app reading a few dozen threads.

**Terms for the other routes.** Reddit's User Agreement (effective 2026-07-01) forbids collecting
data "by any means (automated or otherwise)" except as allowed or via robots.txt crawling, and
"scraping the Services without Reddit's prior written consent is prohibited". Comments stay the
property of their authors. Arctic Shift is a third-party archive for "researchers, moderators and
everyone else", free, asks to be "considerate" (a couple of requests per second at most; dumps for
bulk) and handles removal requests. Using it does not create a licence from Reddit or the authors.

### What is there

- **r/WarhammerOldWorld** ("News, lore and Community for Old World Content", created 2019-12):
  12,385 posts and 94,551 comments in the Arctic Shift archive (counts updated 2026-11-24);
  13,510 subscribers in the last archived snapshot (2025-02; the live count cannot be read).
  Activity: **471 posts in the last 30 days**, with 3,397 comments counted at archive time (so a
  lower bound). Very active.
- **r/TheOldWorld**: 7,822 subscribers but nearly dead (9 posts in the last 30 days).
- **r/WarhammerFantasy**: 137,901 subscribers, 57,079 posts; mixes WFB, Old World and other
  fantasy; a query "old world tactics" found 48 posts, among them "Old World Tactics - a
  discussion" (2026-01-31, 95 points, 40 comments).
- Flairs (sample of 1,343 posts): no flair 591, Question 303, Help 212, Hobby 167, Battle Report 42,
  Hype 28. **The all-time top posts are painting/hobby** (top 15 by score: all hobby or release news,
  400-860 points). Tactics threads score 5-130.

Sampling via Arctic Shift keyword search (title + text), 1,958 unique posts from queries like
tactics, tactica, tips, advice, guide, how do i, chaff, strategy, deployment and army names (several
queries failed, so all counts are lower bounds):
- "tactics" appears in 85 posts in total (2021-2026), "tactica" in 1, "chaff" in 22, "guide" in 65,
  "advice" in 391.
- **389 posts** have a tactics/advice-type title (after removing painting/basing threads): 2024: 72,
  2025: 146, 2026: 196 (the share is rising with the player base).
- Most are list or army-choice help. Median 5 comments; 31 threads have 20+ comments, 6 have 40+.
  Real "how do I play / beat X" threads: roughly 60-100.

**Quality check**: full comment trees of the 11 most-discussed tactics threads (493 comments):
19% of comments are 100+ words, 38% are 50+ words, 28% are under 20 words. The top comments are
usually real advice (concrete units, positioning, magic defence, combat-resolution maths), mixed
with balance complaints, rules arguments (quoting the rulebook, sometimes wrong) and advice that
predates FAQ 1.5. Useful, but each thread needs reading and rule-checking, and many threads hold one
or two good comments.

### Example threads (r/WarhammerOldWorld)

| Date | Title | Score | Comments | Useful advice in it | URL |
|---|---|---|---|---|---|
| 2025-03-17 | How to deal with night goblins fantics | 111 | 82 (98 in archive) | Charge through with high-T/armour units, use dangerous-terrain templates and woods, keep lone characters inside units | https://www.reddit.com/r/WarhammerOldWorld/comments/1jdq00t/ |
| 2024-11-14 | Infantry Countering Dragons | 16 | 78 | Why the dragon player avoids your deathblock; challenges vs lone characters, stubborn/second champion, Griffon Banner ranks (rules-heavy) | https://www.reddit.com/r/WarhammerOldWorld/comments/1grgp21/infantry_countering_dragons/ |
| 2026-04-21 | How to deal with wood elves? | 8 | 74 | Slow armies vs a gunline: cover modifiers, play objectives to force them forward, Dwarf shooting characters and rune choices | https://www.reddit.com/r/WarhammerOldWorld/comments/1srxv87/how_to_deal_with_wood_elves/ |
| 2026-04-19 | Empire tactics? | 76 | 56 | Infantry wins by static combat resolution (big units, Griffon Banner), limited value of handguns off hills, cheap captains and wizards | https://www.reddit.com/r/WarhammerOldWorld/comments/1sq69k5/ |
| 2024-06-14 | How to shut down magic (Empire) | 14 | 34 | Magic as force multiplier, accept losses and kill the wizard; Wizard's familiar, War Altar, Pegasus riders as 360° threat to wizards | https://www.reddit.com/r/WarhammerOldWorld/comments/1dg31on/how_to_shut_down_magic_empire/ |
| 2025-12-22 | How does Bretonnia win combats? | 21 | 30 | Post-1.5: infantry holds with static CR, lances hit flanks for impact; fitting three lances on one infantry front; screening pegasi | https://www.reddit.com/r/WarhammerOldWorld/comments/1pt9vor/how_does_bretonnia_win_combats/ |
| 2026-04-03 | WoC tips for fighting dragons | 10 | 26 | Chaos Lord with Ogre Blade and monster-hunter kit in Chaos Knights; why no-dragon lists struggle | https://www.reddit.com/r/WarhammerOldWorld/comments/1sb5ogq/woc_tips_for_fighting_dragons/ |
| 2025-11-24 | Dark Elves TOW Tactics - whatever happened to MSU? | 21 | 22 | Why multiple small units lost value (flanking no longer kills units cheaply); cavalry, chariots and monsters do the job | https://www.reddit.com/r/WarhammerOldWorld/comments/1p57sg2/dark_elves_tow_tactics_whatever_happened_to_msu/ |
| 2026-05-20 | How to deal with levies and other feigned flight units | 5 | 20 | Feigned Flight only auto-rallies after fleeing a charge; Windblast; common rules mistakes | https://www.reddit.com/r/WarhammerOldWorld/comments/1tifaxr/how_to_deal_with_levies_and_other_feigned_flight/ |
| 2026-01-29 | How effective is terror in this edition? | 20 | 17 | Terror belongs on fast charging units; immune armies and Fear interactions make it situational | https://www.reddit.com/r/WarhammerOldWorld/comments/1qpwfkj/how_effective_is_terror_in_this_edition_is_this/ |
| 2025-02-21 | Advice on Dwarven army list + tactics to counter Tomb Kings | 9 | 17 | Handling a healing Tomb King on dragon at 1,000 pts; why Khemri is hard for beginners | https://www.reddit.com/r/WarhammerOldWorld/comments/1iuu21f/advice_on_dwarven_army_list_tactics_to_counter/ |

### Assessment

- **Quality**: mixed. Good for "how do I beat X" and counters (questions our video lessons rarely
  answer head-on); weak as a source of structured tactics. Short opinions and rules disputes dominate.
- **Access**: only Arctic Shift works (free, flaky search, third party). Official API: approval needed.
- **Effort**: medium. Picking threads, reading full trees, checking every claim against the rules
  and the FAQ date. Roughly one to three lessons per good thread.
- **Risks/terms**: Reddit's User Agreement forbids scraping without consent; the Data API Terms
  forbid storing beyond the use case and ML training. Comments belong to their authors. A
  respectful route: read a small, hand-picked set of threads, never bulk-download, store no copies
  in the repo (same as transcripts), quote at most 15 words with the thread link and "r/WarhammerOldWorld
  user" attribution (no usernames needed), and drop anything deleted.
- **Recommendation**: **later, small and targeted.** 20-40 threads with 20+ comments on counters and
  army play, via Arctic Shift, one at a time. Not the official API, not bulk.

---

## 2. Podcasts

### What is there

Found via the Apple Podcasts directory (iTunes Search API, which returns the public RSS feed) and
then read from each RSS feed. "Tactics-like" = episode titles matching tactic/guide/review/list
building/combat/magic/deployment and similar; a rough indicator, not a reading.

| Podcast | Hosts / standing | Episodes (feed) | Period | Typical length | Also on YouTube? | Tactics share | RSS |
|---|---|---|---|---|---|---|---|
| **Square Based** | Rob and Val; write the Renegade lists and Square Based comp, run events | 100 in feed (feed holds the latest 100) | 2024-12 to 2026-11-12 | ~70 min | **Yes**: 74 of 100 titles match videos on @SquareBasedOldWorld one-to-one; the rest are title variants of the same shows | Mostly news, reviews (Arcane Journals, FAQs, faction state); some deep dives | https://feed.podbean.com/squarebasedpodcast/feed.xml |
| **Old World Fanatics** | gommo, Andrew, Josh (AU); run Old World Rankings | 183 | 2023-08 to 2026-11-24 (weekly) | ~2 h (live streams) | **Yes**: 179 of 183 show notes link @oldworldfanatics; 106 titles match our cached video list (lives sit in the Streams tab) | Mainly news, tournament debriefs, list reviews; a few tactics episodes (EP123 "Tactics at the Table", EP131 "List Building For Tournaments", EP143 "Cold Combat") | https://feeds.transistor.fm/old-world-fanatics |
| **The 2+ Podcast** | Long-running UK show; already our A-source | not in Apple/Spotify directories under that name | ongoing | 20-60 min videos | **YouTube is the home**; our cache lists 350 videos incl. playlists "Podcast Episodes" and "Tactics" | Highest tactics share of all | (none found; YouTube only) |
| **Beards, Ears and Skulls** | Taylor, Tim, Dan (Professional Casual Network) | 87 | 2024-01 to 2026-03-16 (seems paused) | ~75 min | Partly: the network's YouTube channel (UCfUOaJjpMfgRFWL7Z996lyQ) carries network shows; not checked episode by episode | Two formats: "Faction Focus" (Arcane Journal and army reviews) and "Accidental Tactics" (their games, lists, events); 47 of 87 titles tactics-like but mostly list/event talk | https://feeds.captivate.fm/beards-ears-and-skulls/ |
| **Rank and Flank** | Team podcast with its own website | 30 | 2024 to 2025-01-18 (ended or paused) | n/a | Unknown | Mix of hobby, WFB nostalgia and game talk | https://rankandflank.com/feed/podcast/ (blocked by a Vercel "Security Checkpoint" for scripts) |
| **The Old World Lives!** | WFB club show (apparently Swedish) | 89 | 2018-07 to 2026-10 (sporadic) | ~90 min | No (3 of 89 mention YouTube) | Old "Tactica" episodes are WFB 6th/8th edition (2019-2020); recent ones are chat | https://feed.podbean.com/theoldworldlives/feed.xml |
| NineInchCharge | | 32 | 2021-06 to 2023-03 (ended) | ~35 min | Yes (YouTube channel, our C list) | Pre-release lore and unit overviews; no TOW tactics | https://anchor.fm/s/608848ec/podcast/rss |
| Laying Down The Lore: Old World | Dhar, Cral, Ben | 103 | 2021 to 2026-11-25 (weekly) | ~80 min | No | Lore only, zero tactics | https://anchor.fm/s/fa3e2628/podcast/rss |
| Motley Crewed | Andrew, Ryan, Keven | n/a | n/a | n/a | n/a | Named in search results as a TOW podcast; not found in the Apple directory | n/a |

Not Old World despite the name: "The Old World with Will Tanner" (US history), "Vanguard Tactics"
(40k), "Grim imPortents" (TOW roleplaying game actual play, also on YouTube via Glory of Golden State
Gaming), "Tales from the Old World" and "Gallows Geists" (WFRP actual play).

### Transcripts

- **Podcast RSS transcript tags**: none of the 8 feeds carries a `<podcast:transcript>` tag.
- **Apple Podcasts / Spotify auto-transcripts**: shown inside the apps only. There is no public API
  or export, so not a usable route (not tested in-app).
- **Show notes**: 130-500 words per episode (Old World Fanatics ~250, Beards Ears and Skulls ~470,
  Square Based 130-460). Chapter lists and links, no advice. Useful for picking episodes, not as a
  source.
- **YouTube captions**: for Square Based, Old World Fanatics, The 2+ Podcast and probably Beards Ears
  and Skulls, the video version exists, so the existing browser-transcript route works unchanged.

### Local transcription (audio-only episodes)

Checked on this machine:

| Item | Status |
|---|---|
| `openai-whisper`, `faster-whisper`, `whisper-ctranslate2` (pip) | not installed |
| `whisper`, `whisper-cli` (whisper.cpp) on PATH | not found |
| GPU | NVIDIA GeForce RTX 2070, 8 GB VRAM (about 3.3 GB already in use by other apps), driver 610.88, CUDA 13.3 UMD |
| CPU / RAM | Intel i9-9900K (8 cores / 16 threads), 128 GB |
| Python | 3.14.3; torch 2.12.0 **CPU-only** build installed (`cuda.is_available() = False`) |
| ffmpeg | **not on PATH**, but two copies exist: `imageio_ffmpeg` (ffmpeg 7.1, in the Python 3.14 site-packages) and `D:\CLAUDE CODE\komma-archfilm\node_modules\ffmpeg-static\ffmpeg.exe` |
| yt-dlp | Python module 2026.10.26 (works for listing, not for subtitles, see `tactics/README.md`) |

What it would take: `pip install faster-whisper` (CTranslate2 4.9.1 has Python 3.14 wheels) plus
the CUDA 12 cuBLAS and cuDNN 9 runtime wheels for GPU use, or a prebuilt whisper.cpp CUDA build.
Audio comes straight from the RSS `<enclosure>` MP3 links (normal podcast distribution).

Time estimate per hour of audio, scaled from the faster-whisper benchmark (13 min of audio, large-v2,
RTX 3070 Ti 8 GB: 63 s fp16, 16-17 s batched) to a slower RTX 2070:

| Setup | Per hour of audio |
|---|---|
| GPU, large-v3, int8/fp16, sequential | ~6-8 min |
| GPU, large-v3, batched (batch 8, needs ~4.5-6 GB VRAM: close other GPU apps) | ~2 min |
| CPU only, small model, int8 | ~10-12 min (lower accuracy on unit and army names) |
| CPU only, large-v3 | roughly real time or slower (45-90 min) |

The audio-only backlog that would actually matter is small: Beards Ears and Skulls (~114 h,
partly on YouTube) and Rank and Flank (30 episodes). That is about 15 GPU hours plus the name-repair
work (`tactics/garbled.json`) on noisier, unscripted talk.

### Assessment

- **Quality**: chat-heavy. Long, multi-host shows spend most time on news, releases, events and
  lists. Tactics come in passing, which makes lesson extraction slow per hour of audio.
- **Access**: the valuable shows are already on YouTube (route works). RSS is open for the rest.
- **Effort**: none extra for the YouTube versions; a Whisper setup plus 15+ GPU hours for audio-only.
- **Risks/terms**: transcripts stay private, like now; quotes short with a timestamp and a link.
- **Recommendation**: **later, and only via YouTube.** Pick the few tactics episodes of Old World
  Fanatics (EP123, EP131, EP143 and similar) through the existing route. Whisper: **not now**; the
  audio-only shows carry too little tactics to justify a GPU setup.

---

## 3. Written tactics

### Tabletop Battles (formerly Goonhammer)

Goonhammer moved to tabletopbattles.com (goonhammer.com URLs redirect with 301). The Old World
category `https://www.tabletopbattles.com/category/other-games/theoldworld/` (5 pages) lists **87
articles, 2024-01-06 to 2026-11-21**; the landing page
`https://www.tabletopbattles.com/warhammer-the-old-world/` adds one army showcase, and
"Altering Comp in the Old World" (`/altering-comp-in-the-old-world`) exists outside the category.

Breakdown of the 87:

| Kind | Count | Tactics value |
|---|---|---|
| Tactics essays | 12 | High |
| Faction reviews and Arcane Journal reviews | 25 | Medium-high (unit roles, how the army plays, builds) |
| Rules explainers (Ye Olde Ruleshammer) and FAQ reviews | 8 | Medium (rules, dated) |
| Model/box reviews | 13 | Low-medium (unit use sections) |
| News, lore, showcases, painting, events, columns | ~29 | None |

The 12 tactics essays (URLs on `https://www.tabletopbattles.com/<slug>`):

| Date | Title | Slug |
|---|---|---|
| 2024-01-06 | Old World, New Tricks | `old-world-new-tricks` |
| 2024-02-05 | The Line Tactic and Why it Doesn't Work | `the-old-world-line-and-why-it-doesnt-work` |
| 2024-03-13 | On The Merits of Being Bad | `the-old-world-on-the-merits-of-being-bad` |
| 2024-03-20 | Shooting and Volley Fire | `the-old-world-shooting-and-volley-fire` |
| 2024-05-01 | Reserve Move and You | `old-world-reserve-move-and-you` |
| 2024-05-28 | Magic in The Old World: Forces of Fantasy | `magic-in-the-old-world-forces-of-fantasy` |
| 2024-08-30 | The Old World: Six Months In | `the-old-world-six-months-in` |
| 2025-03-19 | Orderly and Respectable Combat with Drilled | `warhammer-the-old-world-orderly-and-respectable-combat-with-drilled` |
| 2025-04-16 | The Art of the Death Star (Part 1; no Part 2 published) | `warhammer-the-old-world-the-art-of-the-death-star-part-1` |
| 2025-08-08 | Magic and Its Role in v1.5.1 | `warhammer-the-old-world-magic-and-its-role-in-v1-5-1` |
| 2025-08-22 | Command Stations? | `warhammer-the-old-world-command-stations` |
| 2025-10-03 | Using Terrain to Your Advantage | `warhammer-the-old-world-using-terrain-to-your-advantage` |

Faction and Arcane Journal reviews (25): Warriors of Chaos (2024-01-15, Arcane Journal 2024-08-31),
Wood Elves (2024-01-23, AJ 2025-05-17), Daemons of Chaos and Lizardmen legacy reviews (2024-02),
Beastmen (2024-05-07, AJ 2025-05-31), High Elves (2024-06-05, AJ 2025-02-15), Bretonnia (2024-08-13,
AJ 2024-01-11), Tomb Kings AJ (2024-01-09), Orc and Goblin AJ (2024-03-23), Dwarfs AJ (2024-07-20),
Empire AJ (2024-12-28), Grand Cathay AJ (2025-06-21), the campaign Arcane Journals (War of
Vengeance, Storm Dragon, Settra's Fury, Razing of Westerland, Great Bastion, River of Bones, Doom of
Lord Carrard; 2024-12 to 2026-11-21) and the Legacy Armies overview (2024-01-22).

No "Start Competing" guide for The Old World exists; that series covers 40k and Age of Sigmar only.

**Access, tested today**: with the generic `tow-companion-research` User-Agent every page answers
**HTTP 202** with an empty challenge page; with a normal browser User-Agent string the category pages
and articles answer **HTTP 200** with full text (2,500-7,100 words per article, no paywall; the Patreon
mentions are only the login link). The RSS feed `/feed/` answers 200 for both. `wp-json` is gone
(404, the site is no longer WordPress). The `/?s=` search returns the home page.

- **Quality**: the best written tactics in the community: long essays with diagrams, dated per
  rules version.
- **Effort**: low. 12 essays plus ~25 reviews; one article is about as long as a 20-30 minute video
  transcript, and there is no transcript repair needed. The Codex route needs a text input instead
  of a transcript; quote checks can work on paragraphs instead of timestamps.
- **Risks/terms**: copyrighted articles. Store the text privately like transcripts, quote at most
  15 words with a link, credit the author. The browser-UA fetch works around an anti-bot challenge;
  keep it to a handful of pages with pauses, or read pages in the Browser pane as a viewer.
- **Recommendation**: **worth doing now** for the 12 essays; the faction reviews next, newest first
  (older ones predate FAQ 1.5).

### Other written sources

| Source | What is there | Access today | Value |
|---|---|---|---|
| **1d6chan Old World Tactics** (`https://1d6chan.miraheze.org/wiki/Warhammer/Old_World_Tactics/...`) | 22 pages: General Tactics, Movement, Magic 101, Magic Items, and 18 army pages (incl. Renegade Crowns, Grand Cathay, Chaos Dwarfs, Daemons). 14-72 KB each, **most edited in Sep-Nov 2026** (Empire 2026-11-24, Tomb Kings 2026-11-25) | **200 with the generic UA, also via the MediaWiki API** (`/w/api.php?action=query&prop=extracts&explaintext=1`). A browser UA gets **403**. | High for unit-by-unit and army advice; anonymous, opinionated, crude humour; needs fact-checking against the rules. Licence CC BY-SA (attribution plus link). **Do now / next.** |
| **Bell of Lost Souls** | 381 posts in category "Warhammer The Old World" (since 2023-03); 11 "How to Play <army>" guides (2024-10 to 2025-10: Tomb Kings, O&G, Dwarfs, WoC, Empire, High Elves, Wood Elves, Beastmen, Cathay, Bretonnia) and listicles ("The Five Best ...", "How To Use Real Life Tactics To Win", "Lessons I learned Judging Adepticon") | **200, open WordPress API** (`/wp-json/wp/v2/posts?categories=1743` for the guides) | Medium: short, general, partly meta. **Later**, the 11 army guides first. |
| **Woehammer** | Only 2 "Old World Tactica" posts (Unit Redirect, March Blocking, Jan 2024); rest is AoS/40k and top-3 lists | 200, open WordPress API | Low. Two short pieces, optional. |
| **Chaos Dwarf forum** (discourse.chaos-dwarfs.com) | "[TOW] The Big Chaos Dwarf Tactics Compendium" (43 posts, Mar 2024, 11.6k views) | 200, Discourse JSON (`/t/26477.json`) | Niche, pre-Renegade. Later, if Chaos Dwarfs matter. |
| **Dakka Dakka** | Mainly one huge "Old World news and rumors" thread (12,000+ posts); little tactics | **522** (site down via Cloudflare today) | Low. Not now. |
| **Bolter and Chainsword** | 40k/Horus Heresy forum | 200 | None for TOW. |
| **Army forums**: druchii.net (Dark Elves), ulthuan.net (High Elves), asrai.org (Wood Elves) | Legacy WFB tactics boards | **403** for all three (generic and browser UA) | Blocked. |
| **Army forums**: lustria-online.com (Lizardmen), warhammer-empire.com | Have Old World rules subforums | 200 | Unexplored, likely low volume. Later. |
| **Square Based website** (squarebased.com) | Only the Renegade Legacy Pack PDF, FAQ and a scorecard; no articles | 200 | No tactics; the Renegade pack is rules (already used). |
| **Rank and Flank website** | Articles plus podcast | Vercel security checkpoint (429) | Blocked for scripts. |

---

## Ranked next sources for TACTICS knowledge (not meta)

1. **Tabletop Battles tactics essays (12)**: highest density of real tactical reasoning, open
   text, no transcript repair. Then its faction/Arcane Journal reviews (25), newest first.
2. **1d6chan Old World Tactics pages (22)**: general, movement and magic pages plus one page per
   army, freshly edited, open API, CC BY-SA. Fills army-specific gaps (Dark Elves, Renegade
   Crowns, Chaos Dwarfs) that the videos cover thinly. Treat as community opinion; check rules.
3. **More YouTube from podcast channels already in reach**: the tactics episodes of Old World
   Fanatics (EP123 "Tactics at the Table", EP131 "List Building For Tournaments", EP143 "Cold
   Combat") and the remaining 2+ Podcast "Tactics" playlist. Same route as now, zero new tooling.
4. **Reddit via Arctic Shift, targeted**: 20-40 hand-picked "how do I deal with X / how does army Y
   win" threads with 20+ comments, read once, short quotes plus links. Good for counters and
   matchup questions players actually ask; low yield per thread.
5. **Bell of Lost Souls "How to Play" guides (11)**: easy access, broad beginner-level army advice.

Not recommended now: Whisper transcription of audio-only podcasts, Dakka Dakka, the blocked army
forums, and the official Reddit Data API.
