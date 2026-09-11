# Pokemon Bokstavs-Spel

Ett pedagogiskt spel för barn som lär sig läsa, räkna och lyssna genom att fånga Pokemon.
Byggt för en femåring som inte kan läsa: all vägledning sker med ljud och bilder.

## Om spelet

Barnet möter en Pokemon och stavar dess namn genom att trycka på rätt bokstäver.
Fångade Pokemon hamnar i Pokedexen. Pokébollar köps för mynt, och mynt tjänas i
minispelen bakom lyckohjulet: bokstavslyssning, första bokstaven, ordbilder, siffror,
klockan, addition, multiplikation, tiokompisar, vokaler, stavning, taligenkänning,
piano med mera.

### Funktioner

- **151 Pokemon** (Gen 1) med bilder, typer och uttal
- **Svenska alfabetet** (A–Ö) med inspelat ljud för varje bokstav
- **23 minispel**, valda med ett lyckohjul vars sannolikheter styrs från adminpanelen
- **Adaptiv svårighet** – bokstäver och tal som barnet blandar ihop kommer oftare,
  och rätt svar sägs alltid högt när barnet svarar fel
- **Streak-bonus** – fler mynt i rad, extra bonus vid 3 och 5 rätt
- **Pokedex** med stora, tryckbara nummer som läses upp
- **Lokalt sparande** – allt sparas i webbläsaren

## Starta

```bash
npm install
python3 download_pokemon_images.py     # bilderna ligger inte i git
python3 optimize_pokemon_images.py     # krymp dem för iPad (valfritt men rekommenderat)
npm run dev                            # https://localhost:5173/
```

Servern körs med HTTPS (krävs för taligenkänning). Bygg för produktion med `npm run build`.

### Adresser

| Adress | Vad |
|---|---|
| `/` | Huvudspelet (fånga Pokemon) |
| `/pokeballs` | Lyckohjulet med slumpade minispel |
| `/games` | Lista över alla minispel med direktlänkar (t.ex. `/letters`, `/addition`) |
| `/store` | Affären |
| `/admin` | Adminpanel: sannolikheter, inställningar per minispel, ordlista, Pokemon |
| `/reset` | Nollställ allt |

## Tester

```bash
npm test
```

Vitest i Node. Phaser kan inte köras utan webbläsare, så minispelen körs mot
`test/helpers/fakeScene.js`. Se `test/README.md`.

## Struktur

```
src/
├── main.js                  # routing och Phaser-bootstrap
├── admin/                   # adminpanelen
├── minigameRegistry.js      # ENDA listan över minispel (klass, rutt, vikt, ikon, färg)
├── minigameWheel.js         # lyckohjulet, härlett ur registret
├── minigameConfig.js        # en cachad läsning av public/config/minigames.json
├── storage.js               # säker localStorage (all lagring går via denna)
├── audio.js                 # säker ljuduppspelning (okända nycklar kastar aldrig)
├── adaptive.js              # viktat urval utifrån barnets misstag
├── streak.js, currency.js, inventory.js, caughtPokemon.js
├── scenes/                  # BootScene, MainGameScene, PokeballGameScene, SettingsScene
├── pokeballGameModes/       # ett minispel per fil + BasePokeballGameMode + uiKit
└── pokemonData.js           # genereras av fetch_pokemon_data.py
public/
├── config/minigames.json    # inställningar (sparas från /admin i dev-läge)
├── pokemon_images/          # laddas ner, ej i git
└── *_audio/                 # inspelat tal (edge-tts, trimmat)
```

Utvecklingsregler och checklistor (nya minispel, nya Pokemon, ljud) finns i `.claude/CLAUDE.md`.

## Tack till

- **PokeAPI** för Pokemon-data och bilder
- **Phaser 3** för spelmotorn
- **Bosse** – den bästa Pokemon-tränaren
