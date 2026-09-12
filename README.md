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

- **Alla 1025 Pokemon** (Gen 1–9) med bilder, typer och uttal – hur många som finns i spelet
  (151 som standard) ställs in per barn i adminpanelen, som också visar och styr vilka
  Pokemon som dyker upp härnäst
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

Servern körs med HTTPS (krävs för taligenkänning). Bygg för produktion med `npm run build`
och kör sedan `npm run serve` (serverar `dist/` och kontot-API:t på port 8080).

### Konton

Spelet frågar efter ett namn första gången (eller efter 👤 i inställningarna). Ett nytt
namn skapar ett nytt konto, ett känt namn öppnar det kontot. All progression sparas på
servern i `data/game.db` (SQLite, ej i git; flytta med `POKEMON_DB_PATH`), så samma barn
kan spela på vilken enhet som helst. API:t finns i `server/api.js`.

### Driftsätta på hemmaservern

```bash
ssh-copy-id oloflandin@Olofs-Mac-mini.local   # en gång, så slipper du lösenord
npm run deploy                   # test + bygg + ladda upp + starta om
```

`deploy/deploy.sh` rsyncar `dist/`, `server/` och `deploy/` till `~/srv/pokemon` på servern och
kör `deploy/install.sh` där. Det skriptet skapar ett självsignerat certifikat (HTTPS krävs för
mikrofonen; godkänn varningen en gång per iPad), installerar en launchd-tjänst som håller servern
igång på port 443 och en nattlig säkerhetskopia av databasen. Allt som ska överleva en
driftsättning (databas, certifikat, kopior, loggar) ligger i `~/srv/pokemon-data`.
Spelet nås sedan på `https://olofs-mac-mini.local/`. `DEPLOY_HOST` och `DEPLOY_DIR` ändrar målet.

Om Tailscale körs på servern sätter skriptet också upp Tailscale Serve, så att spelet nås på
`https://olofs-mac-mini.<tailnet>.ts.net/` från alla enheter i tailnetet, med ett riktigt
certifikat som Tailscale utfärdar och förnyar själv (ingen varning). Det kräver att MagicDNS och
"HTTPS Certificates" är påslagna under DNS i Tailscales adminkonsol. `POKEMON_TAILSCALE=0`
hoppar över steget.

### Adresser

| Adress | Vad |
|---|---|
| `/` | Huvudspelet (fånga Pokemon) |
| `/pokeballs` | Lyckohjulet med slumpade minispel |
| `/letters`, `/addition`, … | Ett enskilt minispel på repeat (alla länkas från adminpanelens flik "Try a game") |
| `/store` | Affären |
| `/admin` | Adminpanel per konto: sannolikheter, inställningar per minispel, ordlista, Pokemon, nästa Pokemon i kö, prova minispel (`?user=Namn`). Ändringar når ett spel som redan är igång inom några sekunder |
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
├── storage.js               # sparat läge i minnet (all lagring går via denna)
├── account.js, login.js     # konto per namn, synk mot servern, inloggningsskärm
├── audio.js                 # säker ljuduppspelning (okända nycklar kastar aldrig)
├── adaptive.js              # viktat urval utifrån barnets misstag
├── streak.js, currency.js, inventory.js, caughtPokemon.js
├── scenes/                  # BootScene, MainGameScene, PokeballGameScene, SettingsScene
├── pokeballGameModes/       # ett minispel per fil + BasePokeballGameMode + uiKit
└── pokemonData.js           # genereras av fetch_pokemon_data.py
server/
├── db.js                    # SQLite (node:sqlite): konton + sparat läge per nyckel
├── api.js                   # /api/accounts, /api/login, /api/state, /api/reset
├── vitePlugin.js            # monterar API:t på dev-servern
└── index.js                 # fristående server för dist/ (npm run serve)
public/
├── config/minigames.json    # standardinställningar; /admin sparar per konto ovanpå dessa
├── pokemon_images/          # laddas ner, ej i git
└── *_audio/                 # inspelat tal (edge-tts, trimmat)
```

Utvecklingsregler och checklistor (nya minispel, nya Pokemon, ljud) finns i `.claude/CLAUDE.md`.

## Tack till

- **PokeAPI** för Pokemon-data och bilder
- **Phaser 3** för spelmotorn
- **Bosse** – den bästa Pokemon-tränaren
