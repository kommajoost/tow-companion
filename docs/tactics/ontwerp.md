# Tactiekdatabank: ontwerp

Status: voorstel, wacht op akkoord van Joost (22-11-2026).

## Waarom

AI verzint bij tactiekvragen over The Old World vaak zelf iets dat niet klopt. Joost wil een
databank met tactiek die echt van andere spelers komt (vooral YouTube, daarnaast artikelen en
forums), waarin hij zelf kan zoeken en waar zijn AI naar verwijst. Elke les moet na te kijken zijn
bij de bron.

## Doelen

- Lessen van spelers, elk met bron, datum en bij video's het tijdstip.
- Twee ingangen: zoeken op les (onderwerp, leger, unit) en bladeren per bron (kanaal, video, welke
  lessen eruit kwamen).
- Een volledige kanalenlijst met waardering en aantal lessen per kanaal.
- Eerst algemene speltactiek, daarna Dark Elves.
- Later inlaadbaar als tabblad in de Companion en bruikbaar voor de AI-koppeling.

## Niet in deze stap

- De AI-koppeling (MCP, instructies, skill). Die volgt als derde onderdeel en gebruikt deze gegevens.
- Zelf lessen beoordelen of bewerken op de pagina.
- Andere legers dan Dark Elves.

## Wat het nooit mag worden

- Een plek waar AI-verzinsels tussen de lessen staan. Een les zonder bron bestaat niet.
- Een kopie van andermans werk: geen hele transcripten of artikelen op de site.

## Aanpakken

1. **Vast gegevensbestand in de Companion-repo (gekozen).** Een verzamelroutine op Joosts pc maakt
   `public/tactics/*.json`; een verborgen pagina in de app toont ze. Het tabblad later is dan alleen
   een knop erbij, en de AI-koppeling kan dezelfde bestanden lezen.
2. **Supabase-database.** Maakt beoordelen op de pagina mogelijk, maar vraagt login en meer bouwwerk.
   Kan later: het bestand gaat zo de database in.
3. **GBrain.** Afgevallen: dat is persoonlijk geheugen en niet deelbaar met de app.

Afwijking van het eerdere voorstel "los project": het wordt een map in de Companion-repo. Reden: de
databank heeft de unitnamen, Renegade-gegevens en regelteksten van de Companion nodig, en de
AI-koppeling moet straks bij alle drie.

## Gegevens

`public/tactics/bronnen.json`
```
{ kanalen: [{ id, naam, url, type: 'youtube'|'artikel'|'forum', waardering: 'A'|'B'|'C', omschrijving }],
  bronnen: [{ id, kanaalId, titel, url, datum, duurMin?, verwerktOp, lessen: number }] }
```

`public/tactics/lessen.json`
```
{ bijgewerkt, lessen: [{
    id, titel,                // korte stelling, Engels
    tekst,                    // 1 tot 3 zinnen, in eigen woorden, Engels
    onderwerp,                // deployment | movement | charging | shooting | combat | magic |
                              // list-building | scenarios | characters | psychology | chaff
    leger,                    // null = algemeen, anders de Companion-slug (dark-elves)
    units: string[],          // Companion-unitnamen waar de les over gaat
    bronnen: [{ bronId, url,  // url met tijdstip (&t=123s)
                tijd?, citaat }],   // citaat: hooguit 15 woorden, om na te kijken
    datum,                    // datum van de oudste bron
    markeringen: [{ soort: 'verouderd'|'renegade-afwijking'|'regel-afwijking', tekst }]
}] }
```

Lessen in het Engels: de bronnen, de spelregels en de app zijn Engels. De AI kan in het Nederlands
antwoorden.

## Verzamelroutine (lokaal, `tactics/`)

1. `tactics/kanalen.json`: de goedgekeurde kanalenlijst (zie `bronnen.md`).
2. Video's per kanaal ophalen met yt-dlp; filteren op Old World en op tactische inhoud (titel, daarna
   een korte AI-beoordeling). Het pc-spel "Old World" wordt eruit gefilterd.
3. Ondertiteling ophalen naar `tactics/ruw/` (staat in `.gitignore`, komt nooit op de site).
4. Namen herstellen met de unit- en regelnamen uit de Companion.
5. Lessen uittrekken met Claude Code: alleen wat de spreker zegt, met tijdstip en kort citaat.
6. Samenvoegen: dezelfde les uit meerdere bronnen wordt een les met meerdere bronnen.
7. Controles, als markering op de les:
   - bron ouder dan een regelwijziging die het onderwerp raakt (FAQ 1.5 tot 1.5.3): `verouderd`;
   - genoemde unit bestaat niet of wijkt af in de Renegade-lijst: `renegade-afwijking`;
   - de les spreekt een regeltekst in `public/rules.json` tegen: `regel-afwijking`.
8. Wegschrijven naar `public/tactics/` en deployen.

## Pagina

Verborgen route in de Companion (alleen via de directe link), drie weergaven:

- **Lessons:** zoekveld, filters op onderwerp, leger, unit en waardering van de bron. Per les de
  tekst, de markeringen en het aantal bronnen.
- **Les open:** elke bron met kanaal, titel, datum, citaat en een link naar het moment in de video.
- **Sources:** kanalen met waardering en aantal lessen; een kanaal open toont de video's, een video
  open toont de lessen die eruit kwamen.

## Proef

- Ronde 1, algemene tactiek: de drie A-kanalen, HammerHobby, Zen Fox Games, FACEHAMMER TV en de
  tactiekessays van Tabletop Battles. Ongeveer 30 tot 40 bronnen.
- Ronde 2, Dark Elves: de lijst uit `bronnen.md`.
- Na ronde 1 beoordeelt Joost de kwaliteit voordat ronde 2 start.

## Aan de bouwer

Indeling van de scripts, de precieze zoeklogica en de opmaak van de pagina (in de stijl van de
bestaande Companion-schermen).
