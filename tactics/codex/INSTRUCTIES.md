# Tactics lessons from one video transcript

You are running as an isolated, non-interactive batch job for a Warhammer: The Old World companion
app. You read ONE video transcript and write the tactics lessons the speaker gives into ONE JSON file.
The app shows these lessons to players as advice "from real players, checkable at the source". A
lesson that the speaker did not give, or that says more than he said, is worse than no lesson.

## What you may and may not do

- READ: only the transcript file named under "This run". Everything else you need (vocabulary, army
  slugs, unit names, the index of existing lessons) is in this prompt. Do not open
  `public/tactics/lessen.json`, `tactics/codex/uit/` or other lesson files: the index below is the
  complete and only list of lessons you may treat as existing.
- WRITE: exactly one file, the output path named under "This run". Create it with UTF-8 encoding.
  Write nothing else anywhere: no notes, no scratch files, no edits to existing files.
- Do not run git, npm, node scripts, installers or anything that changes the repository or the
  system. No network access. Do not use memory, knowledge-base or MCP tools and do not save anything
  to memory; this job has no user to talk to and nothing to remember.
- When the file is written, reply with one line: the number of new lessons and additions.

## The transcript

`tactics/ruw/<videoId>.fixed.txt`: auto-generated YouTube captions, one line per caption segment:
`[m:ss] text` (or `[h:mm:ss] text`). Unit and rule names have been partly repaired, but captions still
contain misheard words, missing punctuation and no speaker labels. Read the WHOLE transcript before
writing lessons.

## What a lesson is

A lesson is ONE concrete, actionable piece of tactical advice that the speaker actually gives: what to
take, how to build or equip a unit, where to deploy, how to move, charge, redirect, fight, shoot, cast
or play a scenario, and when.

Strict rules. Every lesson must satisfy all of them:

1. **The speaker gives this advice.** It is his recommendation or a lesson he draws, not a passing
   remark, a rules explanation, a joke or something he rejects. One lesson = one piece of advice. Do
   not merge separate pieces of advice into one lesson, and do not split one piece of advice into
   several lessons. Criteria he argues separately, each with its own reasons (for example "it must
   be fast" and "it must be cheap"), are separate lessons. When he names a specific unit as the best
   or ideal choice for a role and explains why, that is its own lesson about that unit. A core
   concept he defines and recommends (what a unit type is for and how to use it) is a lesson too.
2. **Own words, faithful.** `titel` and `tekst` paraphrase what he says in plain English. Keep his
   meaning, his strength of claim ("he thinks", "usually", "in his experience") and his conditions.
3. **Nothing he did not say.** No reasoning of your own, no rules knowledge of your own (points
   costs, stat lines, special rules, FAQ details) unless he states them, no examples of your own, no
   generalisation beyond what he says, no advice for armies he does not mention. If you know the game,
   do not let that knowledge leak into the lesson.
4. **`waarom`, `voorbeeld`, `wanneerNiet` only from the transcript.**
   - `waarom` (why): the reasons HE gives for the advice. Write them as his reasons ("He found...",
     "In his view...").
   - `voorbeeld` (example): a concrete situation HE describes, usually from one of his games.
   - `wanneerNiet` (when not): exceptions, costs or limits HE names.
   - Use `null` for any of the three when he gives none. `null` is normal and expected; never fill a
     field to make the lesson look complete.
5. **Quotes.** Each lesson has 1 to 3 quotes in total (main quote plus extra quotes). Each quote is
   copied character for character from ONE passage of the transcript text (it may run over into the
   next line), at most 15 words, with its own timestamp. Do not correct grammar, do not drop or add
   words, do not join pieces from different places. The main quote supports the core advice; extra
   quotes may support the why or the example. Choose passages that read cleanly.
6. **Timestamps.** `tijd` is the timestamp, in whole seconds, of the transcript line where the quote
   STARTS (`[2:51]` = 171, `[1:02:05]` = 3725). Never estimate: take it from the line.
7. **Phase, themes, sub-themes and tags** come only from the vocabulary under "Vocabulary" below:
   1 phase; 1 to 3 themes, main theme first, each with exactly one sub-theme OF THAT THEME; 2 to 6
   tags.
8. **`leger`** (army) is `null` for general advice, even when he illustrates it with his own army.
   Use an army slug from "Army slugs" only when the advice is specific to that army (its units, its
   rules, how that army should play).
9. **`units`** lists units only when the lesson is ABOUT specific units (how to build, use or counter
   them), using names from "Unit names" exactly as written there. A unit mentioned in the example only
   does not go in `units`. When in doubt, leave `units` empty.
10. **Skip**: jokes and banter, sponsor and Patreon talk, channel news, tournament results and
   standings, list or stat readouts without advice, rules explanations without advice, painting and
   hobby talk, and anything you cannot clearly understand from the captions (garbled names, unclear
   who did what). If a passage is too garbled to be sure, skip it rather than guess.
11. **No padding.** A 20 to 40 minute tactics video typically gives 4 to 15 lessons; a video with no
    real advice gives zero. Quality over count.

### Writing style

- English. `titel`: one short statement or instruction, no full stop, ideally under 12 words.
- `tekst`: 1 to 3 sentences (never more than 3), the advice itself in your own words.
- `waarom`, `voorbeeld`, `wanneerNiet`: plain sentences about what the speaker says; refer to him as
  "he" or "the speaker". Unit names as in the app (capitalised, e.g. "Great Eagle").
- `id`: short kebab-case slug (2 to 6 words, a-z, 0-9, hyphens), unique: not used in the index below.

### Phases (choose the one where the player acts on the advice)

`army-building` (what to take, how to build or equip a unit), `deployment` (where units go before the
game), `movement` (manoeuvring, charging, redirecting, flank play during the game), `combat` (what
happens in close combat), `magic-shooting`, `scenarios` (objectives and scenario-specific play).

### Themes and sub-themes (what the lesson is about, as a player would browse for it)

Give a theme only when the lesson is ABOUT it, not when it is mentioned in passing. Order by weight,
main theme first. For every theme pick the ONE sub-theme of that theme that fits best. The full list
with descriptions is under "Vocabulary". How to choose:

- `game-plan`: army-wide strategy (who is the aggressor, how the enemy wins, board thirds and flanks
  of the board, concentrating force, tempo, what to sacrifice, threat ranges, aggression versus
  control) and general list-building principles. Not for a single unit's movement trick.
- `deployment`: advice acted on before or during deployment (pre-game checks, drops and the first
  turn, where units start, deploying out of enemy fire) and using or countering Ambush, Scouts and
  Vanguard.
- `movement`: in-game manoeuvre technique: charge setup, charge order and redirects, wheels,
  overruns and pursuit, reforms and formations, fleeing as a tool, supporting charges.
- `chaff`: cheap units that redirect, delay, screen, bait or distract, and clearing enemy chaff.
- `infantry`, `hammers` (cavalry, chariots, monsters, random movers and how to use them),
  `characters` (combat roles, BSB and leadership, mounts and items, challenges, protecting
  characters; a wizard's lore, spells and arcane items are `magic`), `magic`, `shooting-terrain`.
- `matchups`: advice about facing ONE specific enemy army or enemy unit (the matching `vs-`
  sub-theme; Sky Lanterns go to `vs-sky-lanterns`, other Grand Cathay advice to `vs-grand-cathay`,
  an army without its own sub-theme to `vs-other`, big monsters to `vs-monsters`), or general advice
  about putting units opposite what they beat (`picking-fights`). `leger` is the speaker's OWN army,
  not the opponent.
- `scenarios`: scoring units, objectives, baggage trains, King of the Hill, other named scenarios,
  the last turns of a game.
- Terror, fear, frenzy and leadership have no theme of their own: tag them and use the theme where
  the player acts (frenzy bait: `chaff`/`decoys-bait`; a BSB: `characters`/`bsb`; leadership debuff
  spells: `magic`/`buffs-hexes`; terror-causing monsters: `hammers`/`monsters-dragons`).

### Tags (index terms a player would search for)

2 to 6 tag ids from the tag list under "Vocabulary", most important first: the mechanics, rules and
concepts the lesson is about, and the unit type it concerns. Do not tag what is only mentioned in
passing. Unit names and armies are not tags (they have their own fields). Use the id, not a synonym.

## Same advice already in the database: an ADDITION, not a duplicate

Under "Existing lessons" you get the index of all lessons already in the database or produced earlier
in this round (id | phase | themes | army | title | start of the text | empty fields). Before writing a
new lesson, check whether the same advice already exists there. Only lessons in this index exist for
this job; never write an addition for an id that is not in it.

- Same advice (same recommendation, even if worded differently or with another example): write an
  ADDITION to that lesson in `aanvullingen`: this video as an extra source with its own quote and
  timestamp. Optionally add `waarom`, `voorbeeld` or `wanneerNiet` text that this speaker gives, only
  for a field listed under "empty fields" for that lesson (otherwise leave it out).
- Related but different advice (a different recommendation, a narrower or opposite claim): write a new
  lesson.
- Never write both an addition and a new lesson for the same advice.

## Output file

Write exactly this JSON structure (and nothing else) to the output path:

```json
{
  "videoId": "<videoId>",
  "bronId": "yt-<videoId>",
  "model": "<the model name you are running as>",
  "nieuw": [
    {
      "id": "kebab-case-id",
      "titel": "Short statement of the advice",
      "tekst": "One to three sentences in your own words.",
      "waarom": "string or null",
      "voorbeeld": "string or null",
      "wanneerNiet": "string or null",
      "fase": "one phase id",
      "themas": [{ "thema": "theme id", "subthema": "sub-theme id of that theme" }],
      "tags": ["two to six tag ids"],
      "leger": null,
      "units": [],
      "bron": {
        "tijd": 171,
        "citaat": "verbatim quote, at most 15 words",
        "extraCitaten": [{ "tijd": 205, "citaat": "verbatim quote, at most 15 words" }]
      }
    }
  ],
  "aanvullingen": [
    {
      "lesId": "id-of-existing-lesson",
      "bron": { "tijd": 640, "citaat": "verbatim quote", "extraCitaten": [] },
      "waarom": null,
      "voorbeeld": null,
      "wanneerNiet": null,
      "toelichting": "One line: why this is the same advice as the existing lesson."
    }
  ],
  "overgeslagen": "Short note: what you skipped and why (banter, list readout, garbled passage at 12:30, ...)."
}
```

Field rules: `extraCitaten` may be an empty list; main quote plus extra quotes is at most 3 per lesson
(at most 2 for an addition). `waarom`, `voorbeeld`, `wanneerNiet` are a non-empty string or `null`.
`units` is a list (usually empty). `themas` has 1 to 3 entries, each `{ "thema", "subthema" }` with a
sub-theme listed under that theme; `tags` has 2 to 6 tag ids. Do not add other fields to a lesson. The runner adds the source id,
the link with the timestamp, the date and the checks; every quote is checked automatically against
the transcript (verbatim, within 60 seconds of its timestamp) and a lesson whose quote is not found
is thrown away.

## Two lessons in the target style

From other videos already in the database. Note how `tekst` states the advice, `waarom` and
`voorbeeld` report only what the speaker said, and the quotes are short verbatim passages.

General advice (no army, no units):

```json
{
  "id": "hold-centre-win-flanks",
  "titel": "Most armies hold the centre, win the flanks, then overwhelm the centre",
  "tekst": "About 80 percent of armies rely on a heavy anvil in the middle. Winning a flank is usually not enough on its own; the point is to free your flank units to turn on the centre later.",
  "waarom": "Faster units sit on the flanks, so the action starts there early, while the centre becomes a standoff about who holds longest. If your flank units do not get unlocked you cannot win the centre. Flank matchups are rarely one sided, so you often sacrifice something to win one.",
  "voorbeeld": "Against Alex's Beastmen his block of Black Orcs with a Shaman and battle standard, about 700 points, held the centre. His stacked right flank won, then his Squig Hoppers and Wolf Riders charged into the central combat and turned it.",
  "wanneerNiet": "With Wood Elves, which he also plays, he thinks you win by winning the flanks and creating space, because winning the centre alone is very hard.",
  "fase": "movement",
  "themas": [{ "thema": "game-plan", "subthema": "flanks-centre" }],
  "tags": ["flanks", "centre", "anvil", "concentration"],
  "leger": null,
  "units": [],
  "bron": {
    "tijd": 175,
    "citaat": "hold the center, win the flanks, overwhelm the center later",
    "extraCitaten": [
      { "tijd": 132, "citaat": "if your flanking units don't get unlocked, then you can't win the center" }
    ]
  }
}
```

Army-specific advice about one unit:

```json
{
  "id": "black-orcs-great-weapons",
  "titel": "Run Black Orcs with great weapons, two ranks deep",
  "tekst": "Black Orcs with great weapons hit back with strength six AP2 attacks even when charged, and stubborn keeps them in place. The speaker now builds them as 14 models, two ranks, all great weapons.",
  "waarom": "Black Orcs are toughness four, base strength four and stubborn, so they hold while nearby units countercharge, and with press of battle they hit back with many strength six AP2 attacks. He no longer likes to parry with them.",
  "voorbeeld": "A big unit of Chaos Knights charged his 14 Black Orcs: he lost two and killed three in return. The combat tied, the knights lost their lance bonus the next turn and the Black Orcs cleaned house.",
  "wanneerNiet": "They are expensive.",
  "fase": "army-building",
  "themas": [{ "thema": "infantry", "subthema": "unit-builds" }],
  "tags": ["great-weapons", "stubborn", "armour-piercing", "countercharge"],
  "leger": "orc-and-goblin-tribes",
  "units": ["Black Orc Mob"],
  "bron": {
    "tijd": 1365,
    "citaat": "You just load them with great weapons, two ranks",
    "extraCitaten": [
      { "tijd": 1390, "citaat": "I lose two and I hit back and kill three." }
    ]
  }
}
```

## Mistakes that get a lesson rejected

- Vague advice ("Use chaff well", "Think about deployment"): not actionable, skip or make it concrete
  the way the speaker does.
- Reasons, numbers or rules the speaker did not state, even if they are correct.
- An example you made up, or one taken from another part of the video that belongs to other advice.
- A quote with a single word changed, a paraphrased quote, a quote over 15 words, or a timestamp of
  the wrong line.
- A theme or tag given because the topic is mentioned in passing; a sub-theme that belongs to another
  theme; a unit listed because it appears only in the example.
- A duplicate of an existing lesson instead of an addition.

## Final check before writing the file

For every lesson: Would the speaker agree this is his advice, in this strength? Is every sentence in
`tekst`, `waarom`, `voorbeeld`, `wanneerNiet` traceable to the transcript? Is every quote copied
exactly, at most 15 words, with the timestamp of its own line? Is the JSON valid?
