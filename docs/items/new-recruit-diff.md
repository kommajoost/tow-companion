# New Recruit vs our magic items

Generated 2026-11-24 by `scripts/sync-new-recruit-items.mjs` (rerun: `npm run sync-new-recruit-items`).

Source: the New Recruit wiki for Warhammer: The Old World, catalogue "Magic Items" (https://www.newrecruit.eu/wiki/tow/warhammer-the-old-world/magic-items),
read from the data each wiki page embeds (Nuxt payload). New Recruit publishes no separate data repository for TOW.
Compared against `public/owb/magic-items.json` (Old World Builder) plus the items in `public/renegade/*-renegade-v2.json`.
Names are matched after normalising case, accents, apostrophes, "&"/"and" and the words the/of/a/an; a remaining difference of at most 2 letters counts as a spelling variant.

- NR item entries read: 555
- Missing from ours: 19 (added: 13, unclear and left out: 6)
- Spelling variants (treated as the same item): 3
- Points or type differences (report only, nothing changed): 1

New Recruit shows no publication or page for these entries, and no flavour text; its rule text is its own summary (field "Note"/"Description"), copied verbatim.

## Missing items, added to `public/extra-items.json`

| Item | Our group (army) | Type | Points | Limits | Publication | Rule text | Why this group | NR page |
|---|---|---|---|---|---|---|---|---|
| Barrow-dirt | general | enchanted-item (Enchanted Items > Extremely Common Items) | 20 | max 1 per model, extremely common | not shown | yes | no restriction in NR | [link](https://www.newrecruit.eu/wiki/tow/warhammer-the-old-world/magic-items/e037-dcb5-958b-a948/barrow-dirt) |
| Crude Canopics | general | arcane-item (Arcane Items > Extremely Common Items) | 30 | extremely common | not shown | yes | no restriction in NR | [link](https://www.newrecruit.eu/wiki/tow/warhammer-the-old-world/magic-items/7f3c-0ca7-3d5c-836a/crude-canopics) |
| Helmcutter | general | weapon (Magic Weapons > Unique Weapons) | 20 | max 1 per army | not shown | yes | no restriction in NR | [link](https://www.newrecruit.eu/wiki/tow/warhammer-the-old-world/magic-items/0fcd-913a-1fcd-d0ff/helmcutter) |
| Morithein's Magnifier | general | arcane-item (Arcane Items > Unique Items) | 25 | max 1 per army | not shown | yes | no restriction in NR | [link](https://www.newrecruit.eu/wiki/tow/warhammer-the-old-world/magic-items/d1bc-5e64-3d83-53f1/morithein's-magnifier) |
| The Armour Of Jet | general | armor (Magic Armour > Extremely Common) | 20 | max 1 per model, extremely common | not shown | yes | no restriction in NR | [link](https://www.newrecruit.eu/wiki/tow/warhammer-the-old-world/magic-items/d81f-dbd0-09fb-a06a/the-armour-of-jet) |
| The Axe Of Abandon | general | weapon (Magic Weapons > Unique Weapons) | 40 | max 1 per army | not shown | yes | no restriction in NR | [link](https://www.newrecruit.eu/wiki/tow/warhammer-the-old-world/magic-items/671a-6a55-cbfb-44b9/the-axe-of-abandon) |
| The Banner Of The Resolute Dead | general | banner (Magic Standards) | 15 | max 1 per army | not shown | yes | no restriction in NR | [link](https://www.newrecruit.eu/wiki/tow/warhammer-the-old-world/magic-items/8d63-5c34-acf0-a918/the-banner-of-the-resolute-dead) |
| The Briar-bow | general | weapon (Magic Weapons > Unique Weapons) | 25 | max 1 per army | not shown | yes | no restriction in NR | [link](https://www.newrecruit.eu/wiki/tow/warhammer-the-old-world/magic-items/e53a-4c6b-a328-b9db/the-briar-bow) |
| The Crown Of Fury | general | enchanted-item (Enchanted Items > Unique Items) | 20 | max 1 per army | not shown | yes | no restriction in NR | [link](https://www.newrecruit.eu/wiki/tow/warhammer-the-old-world/magic-items/4f08-9a09-c155-fc45/the-crown-of-fury) |
| The Flaming Sword | general | weapon (Magic Weapons > Unique Weapons) | 25 | max 1 per army | not shown | yes | no restriction in NR | [link](https://www.newrecruit.eu/wiki/tow/warhammer-the-old-world/magic-items/ff99-3836-e5ac-7ffa/the-flaming-sword) |
| The Mouldering Banner | general | banner (Magic Standards) | 25 | max 1 per army | not shown | yes | no restriction in NR | [link](https://www.newrecruit.eu/wiki/tow/warhammer-the-old-world/magic-items/6ba0-5da2-6eaa-1a5d/the-mouldering-banner) |
| The Obsidian Pendant | general | talisman (Talismans > Unique Items) | 20 | max 1 per army | not shown | yes | no restriction in NR | [link](https://www.newrecruit.eu/wiki/tow/warhammer-the-old-world/magic-items/3888-ebe5-457e-e278/the-obsidian-pendant) |
| The Pariah Stone | general | talisman (Talismans > Unique Items) | 35 | max 1 per army | not shown | yes | no restriction in NR | [link](https://www.newrecruit.eu/wiki/tow/warhammer-the-old-world/magic-items/7c25-7071-2bd2-578f/the-pariah-stone) |

## Unclear, NOT added

| Item | NR group | Points | Limits | Why unclear | NR page |
|---|---|---|---|---|---|
| The Bronze Shield | Magic Armour > Shields | 30 | max 1 per army | condition not a faction: "ancestor is MAY_HAVE_SHIELD" | [link](https://www.newrecruit.eu/wiki/tow/warhammer-the-old-world/magic-items/9477-461a-abfa-025f/the-bronze-shield) |
| Crimson Armour of Dragon | Magic Armour > Suits of Armour | 40 | max 1 per army | other modifiers: set hidden true | [link](https://www.newrecruit.eu/wiki/tow/warhammer-the-old-world/magic-items/81e3-37f9-a05-38a5/crimson-armour-of-dragon) |
| The Armour Of Dust | Magic Armour > Suits of Armour | 45 | max 1 per army | condition not a faction: "ancestor is MAY_HAVE_ARMOUR" | [link](https://www.newrecruit.eu/wiki/tow/warhammer-the-old-world/magic-items/bab6-7b07-208a-fd9f/the-armour-of-dust) |
| The Armour Of Fate | Magic Armour > Suits of Armour | 35 | max 1 per army | condition not a faction: "ancestor is Regular Infantry" | [link](https://www.newrecruit.eu/wiki/tow/warhammer-the-old-world/magic-items/d79b-7774-0cf3-99d1/the-armour-of-fate) |
| Robes of Phakth | Enchanted Items > Unique Items | 50 | max 1 per army | condition not a faction: "parent is Monstrous Infantry" | [link](https://www.newrecruit.eu/wiki/tow/warhammer-the-old-world/magic-items/834a-5ca8-aca4-a418/robes-of-phakth) |
| The Tome Of Oppression | Arcane Items > Unique Items | 40 | max 1 per army | condition not a faction: "ancestor is Regular Infantry" | [link](https://www.newrecruit.eu/wiki/tow/warhammer-the-old-world/magic-items/b61d-ab41-f254-0987/the-tome-of-oppression) |

## Spelling variants (matched, nothing added)

| New Recruit | Ours | Our group |
|---|---|---|
| Demonsword | Daemonsword | warriors-of-chaos |
| Obisidian Dread-Glaive | Obsidian Dread-Glaive | warriors-of-chaos |
| Seal of Xin Po | Seal of Xing Po* | grand-cathay |

## Points or type differences (report only, nothing changed)

| Item | NR points | Our points | NR type | Our type | Our group / source |
|---|---|---|---|---|---|
| Infernal Familiar | **25** | 30 | arcane-item | arcane-item | general (OWB) |

