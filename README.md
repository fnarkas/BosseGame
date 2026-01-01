# Pokemon Bokstavs-Spel

Ett pedagogiskt spel för barn som lär ut svenska alfabetet genom att fånga Pokemon!

## Om Spelet

Ditt barn får möta olika Pokemon i det vilda. För att fånga en Pokemon måste de matcha den lilla bokstaven med rätt stor bokstav. De har 3 försök på sig - lyckas de fångar de Pokemon, annars springer den iväg!

### Funktioner

- **100 Pokemon** att fånga
- **Svenska alfabetet** (A-Ö inkl. Å, Ä, Ö)
- **Anti-fusk system** - bokstäver som redan provats blir gråa
- **Pokedex** - se alla Pokemon du fångat
- **Lokalt sparande** - alla fångade Pokemon sparas mellan sessioner

## Hur Man Spelar

1. En Pokemon dyker upp
2. En liten bokstav visas (t.ex. "a")
3. Klicka på rätt stor bokstav (t.ex. "A")
4. Du har 3 försök (visas med hjärtan ❤️)
5. Lyckas du fångar du Pokemon!
6. Klicka på "Pokedex" för att se alla du fångat

## Hur Man Startar Spelet

### Med Vite Dev Server (Rekommenderas - Hot Reload!)

1. **Installera dependencies (första gången):**
```bash
npm install
```

2. **Starta utvecklingsservern:**
```bash
npm run dev
```

3. **Öppna spelet:**
- Servern startar automatiskt på http://localhost:5173/
- Ändringar i koden uppdateras direkt i webbläsaren! ⚡

### Bygga för Produktion

```bash
npm run build
```
Detta skapar en optimerad version i `dist/` mappen.

## Teknisk Information

### Struktur
```
PokemonCounting/
├── index.html              # Huvudfil
├── styles.css             # Styling
├── package.json           # Dependencies
├── vite.config.js         # Vite konfiguration
├── src/
│   ├── main.js           # Entry point
│   ├── pokemonData.js    # Data för alla 100 Pokemon
│   └── scenes/
│       ├── BootScene.js      # Laddning
│       ├── MainGameScene.js  # Huvudspel
│       └── PokedexScene.js   # Pokedex
└── pokemon_images/        # 100 Pokemon-bilder
```

### Teknologier
- **Vite** - Snabb utvecklingsserver med hot reload ⚡
- **Phaser 3** - Spelmotor (via npm)
- **LocalStorage** - Sparar fångade Pokemon
- **ES Modules** - Modern JavaScript

## Framtida Funktioner (Fas 2)

- [ ] Pokeballs-system (begränsat antal försök)
- [ ] Olika utmaningstyper (matcha ord, stava Pokemon-namn)
- [ ] Svårighetsgrader
- [ ] Ljudeffekter och musik
- [ ] Statistik (framgångsgrad, favorit-Pokemon)
- [ ] Sällsynta Pokemon efter X antal fångster

## Felsökning

### Spelet laddar inte
- Kontrollera att du har internetanslutning (för Phaser CDN)
- Prova att köra med en lokal server (se ovan)
- Öppna Developer Console (F12) för felmeddelanden

### Pokemon-bilder visas inte
- Kontrollera att `pokemon_images/` mappen finns
- Kontrollera att alla 100 bilder finns i mappen

### Pokedex sparar inte
- Kontrollera att cookies/localStorage är aktiverat i webbläsaren
- Testa i ett annat fönster (inte inkognitoläge)

## För Utvecklare

### Lägga till fler Pokemon
1. Lägg till bilder i `pokemon_images/`
2. Uppdatera `js/pokemonData.js` med nya Pokemon
3. Klart!

### Ändra svårighetsgrad
Redigera i `js/scenes/MainGameScene.js`:
```javascript
this.attemptsLeft = 3;  // Ändra antal försök
```

### Ändra bokstäver
Redigera i `js/scenes/MainGameScene.js`:
```javascript
this.swedishAlphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖ'.split('');
```

## Licens

Detta är ett privat projekt för utbildningsändamål.

## Tack till

- **PokeAPI** för Pokemon-data och bilder
- **Phaser 3** för den fantastiska spelmotorn
- **Din son** - den bästa Pokemon-tränaren! 🎮
