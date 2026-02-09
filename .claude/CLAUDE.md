# Claude Code Instructions

## Development Server Policy

**NEVER start the development server!**

### Rules:
1. ❌ **NEVER** run `npm run dev` or any dev server command
2. ✅ The dev server is ALWAYS running with Vite auto-reload
3. ✅ Changes are picked up automatically by hot module replacement
4. ✅ Just make the code changes and notify user they're ready to test

### Remember:
- The dev server is already running in the background
- Vite automatically reloads on file changes
- Starting a new server will cause port conflicts
- Just make changes and let the user test

## Git Commit Policy

**NEVER commit without explicit user approval!**

### Rules:
1. ❌ **NEVER** run `git commit` unless the user explicitly asks
2. ✅ After implementing features, say "Ready for you to test/review"
3. ✅ Wait for user feedback and approval before committing
4. ✅ Only commit when user says "commit this" or "please commit these changes"
5. ✅ Ask "Would you like me to commit these changes?" if unclear

### Remember:
- Committing is the USER's decision, not mine
- The user controls their git history
- Present work for review, don't auto-commit it
- Even if changes are "done", wait for approval before committing

## Game Design Principles

**Target Audience: 5-year-old children who cannot read**

### Critical Rules:
1. ❌ **NO INSTRUCTIONAL TEXT** - No instructions, labels, or UI text
2. ✅ **Learning content CAN use text** - Words for reading practice are OK
3. ✅ All game instructions must be audio-based
4. ✅ UI should be purely visual and intuitive

### Examples:
- ❌ Bad: "Tryck på rätt sida" instruction label
- ✅ Good: Speaker emoji 🔊 + audio instructions
- ❌ Bad: "Försök: 3/25" progress text
- ✅ Good: Visual progress indicators (colored balls, hearts, etc.)
- ✅ Good: Word buttons "äpple, banan, päron" (learning content)
- ❌ Bad: "Välj rätt ord" (instructional text)

### Remember:
- No instructional or informative text (use audio instead)
- Learning content text is allowed (letters, words, numbers)
- Keep it simple and intuitive for young children

## Adding New Minigames to Pokeball Game Scene

**Complete Checklist for Adding a New Minigame Mode**

### 1. Create Game Mode Class
- **Location**: `src/pokeballGameModes/YourGameMode.js`
- **Extends**: `BasePokeballGameMode`
- **Required methods**:
  - `generateChallenge()` - Create the challenge data
  - `createChallengeUI(scene)` - Build the UI
  - `cleanup(scene)` - Destroy all UI elements
- **Important**: Store all UI elements in `this.uiElements` array
- **Callback**: Use `this.answerCallback(isCorrect, answer, x, y)` when player answers

### 2. Create Supporting Data Files (if needed)
- **Example**: `src/speechVocabulary.js`, `src/letterData.js`
- **Purpose**: Store word lists, challenge data, etc.
- Keep data separate from game logic

### 3. Update PokeballGameScene.js
**Imports** (top of file):
```javascript
import { YourGameMode } from '../pokeballGameModes/YourGameMode.js';
```

**Add to MODE_WEIGHTS** (line ~119):
```javascript
const MODE_WEIGHTS = {
    letterListening: 20,
    wordEmoji: 20,
    leftRight: 20,
    letterDragMatch: 20,
    speechRecognition: 20,
    yourNewMode: 20    // Add your mode
};
```

**Update totalWeight calculation** (line ~128):
```javascript
const totalWeight = MODE_WEIGHTS.letterListening +
                  MODE_WEIGHTS.wordEmoji +
                  MODE_WEIGHTS.leftRight +
                  MODE_WEIGHTS.letterDragMatch +
                  MODE_WEIGHTS.speechRecognition +
                  MODE_WEIGHTS.yourNewMode;  // Add here
```

**Add selection case in selectRandomGameMode()** (line ~158):
```javascript
currentWeight += MODE_WEIGHTS.yourNewMode;
if (random < currentWeight) {
    console.log('Selected game mode: Your New Mode');
    return new YourGameMode();
}
```

**Add debug mode case in selectGameMode()** (line ~106):
```javascript
} else if (forcedMode === 'yourmode-only') {
    this.gameMode = new YourGameMode();
    console.log('Selected game mode: Your New Mode (forced)');
```

**Add to gameModeMap in showDiceRollAnimation()** (line ~178):
```javascript
const gameModeMap = {
    'LetterListeningMode': { face: 1, icon: 'game-mode-letter' },
    'WordEmojiMatchMode': { face: 2, icon: 'game-mode-word' },
    'LeftRightMode': { face: 3, icon: 'game-mode-directions' },
    'LetterDragMatchMode': { face: 4, icon: 'game-mode-lettermatch' },
    'SpeechRecognitionMode': { face: 5, icon: 'game-mode-speech' },
    'YourGameMode': { face: 6, icon: 'game-mode-youricon' }
};
```

**Update icon count and spacing** (line ~205):
```javascript
// Create 6 game mode icons in a single row below the dice
const iconSize = 100;
const spacing = 60; // Adjust for number of icons
const totalWidth = (iconSize * 6) + (spacing * 5);
```

**Add icon key to array** (line ~214):
```javascript
const iconKeys = ['game-mode-letter', 'game-mode-word',
                 'game-mode-directions', 'game-mode-lettermatch',
                 'game-mode-speech', 'game-mode-youricon'];
```

**Update dice face range** (line ~255):
```javascript
const randomFace = Phaser.Math.Between(1, 6); // Update max
```

### 4. Update BootScene.js
**Generate dice face** (line ~172):
```javascript
for (let i = 0; i < 6; i++) {  // Update count
```

**Add color to colors array** (line ~163):
```javascript
const colors = [0xFF6B6B, 0x4ECDC4, 0xFFE66D, 0x95E1D3, 0xA78BFA, 0xYOURCOLOR];
```

**Add dot pattern** (line ~169):
```javascript
[{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.2, y: 0.5 },
 { x: 0.8, y: 0.5 }, { x: 0.2, y: 0.8 }, { x: 0.8, y: 0.8 }] // 6 dots
```

**Load icon asset** (line ~72):
```javascript
this.load.image('game-mode-youricon', 'minigame_icons/your_mode.jpeg');
```

### 5. Create Icon Asset
**Location**: `public/minigame_icons/your_mode.jpeg`
**Size**: 256x256 pixels
**Format**: JPEG
**Design**:
- Solid color background matching your dice color
- Simple, bold icon recognizable by 5-year-olds
- Use emojis or simple shapes
- High contrast

**Quick placeholder** (ImageMagick):
```bash
magick -size 256x256 xc:"#YOURCOLOR" -pointsize 80 -gravity center \
  -annotate +0+0 "🎮" public/minigame_icons/your_mode.jpeg
```

### 6. Add Debug Route
**Location**: `src/router.js` (if routing exists)
**Pattern**: `/yourmode` → sets `pokeballGameMode: 'yourmode-only'`

### Testing Checklist
- ✅ Debug path works: `http://localhost:5175/yourmode`
- ✅ Appears in random rotation (play through several rounds)
- ✅ Dice animation shows correct face and icon
- ✅ UI cleanup works (no leftover elements after mode switch)
- ✅ Callback triggers correctly on correct/incorrect answers
- ✅ Mode switches properly after completion
- ✅ No console errors

### Example Reference
See `SpeechRecognitionMode.js` for a complete example implementation.

## Pokemon Management System

**IMPORTANT: The game uses a flexible architecture that dynamically adapts to the number of Pokemon in `POKEMON_DATA`.**

### Current State
- **151 Generation 1 Pokemon** (#1 Bulbasaur → #151 Mew)
- All views use `POKEMON_DATA.length` instead of hardcoded counts
- Legendary Pokemon: #144-151 (Articuno, Zapdos, Moltres, Dratini, Dragonair, Dragonite, Mewtwo, Mew)

### Core Data Structure

**File**: `src/pokemonData.js`
- **Generated automatically** by `fetch_pokemon_data.py` - **DO NOT EDIT MANUALLY**
- Contains array `POKEMON_DATA` with objects:
```javascript
{
    id: 1,
    name: "Bulbasaur",
    filename: "001_bulbasaur.png",
    types: [12, 4],  // Type IDs from PokeAPI
    height: 7,
    weight: 69,
    stats: {
        hp: 45,
        attack: 49,
        defense: 49,
        specialAttack: 65,
        specialDefense: 65,
        speed: 45
    }
}
```

### Adding New Pokemon (e.g., Gen 2)

**Follow these steps in order:**

#### 1. Update Python Scripts

**`fetch_pokemon_data.py`:**
- Update `FILENAME_MAP` dictionary with new Pokemon IDs and filenames
- Change range: `for pokemon_id in range(1, NEW_MAX + 1):`
- Update comments to reflect new total
- Run: `python3 fetch_pokemon_data.py`

**`download_pokemon_images.py`:**
- Update default parameter: `num_pokemon=NEW_MAX`
- Update docstring
- Update main call if hardcoded
- Run: `python3 download_pokemon_images.py`

**`generate_pokemon_audio.py`:**
- Add new Pokemon names to `POKEMON_NAMES` list
- Maintain order matching Pokemon IDs
- Update comments
- Run: `python3 generate_pokemon_audio.py`

#### 2. Verify Flexible Code (Should NOT need changes)

These files already use `POKEMON_DATA.length` and will automatically adapt:

**✅ Already Flexible:**
- `src/main.js` - Admin panel shows `${POKEMON_DATA.length}`
- `src/pokedex.js` - Shows `${POKEMON_DATA.length}`
- `src/scenes/BootScene.js` - Loops over `POKEMON_DATA`
- `src/scenes/MainGameScene.js` - Uses `POKEMON_DATA` directly
- `src/scenes/PokedexScene.js` - Iterates `POKEMON_DATA`

**⚠️ Check for Hardcoded Values:**
If you find any hardcoded Pokemon counts (like "100" or "151"), replace with:
- In template strings: `${POKEMON_DATA.length}`
- In loops: `POKEMON_DATA.forEach(...)` or `for (const pokemon of POKEMON_DATA)`
- In comments: Update to say "all Pokemon" instead of specific numbers

#### 3. Update Rarity System (if needed)

**File**: `src/pokemonRarity.js`

If adding legendary Pokemon beyond #151:
```javascript
const LEGENDARY_IDS = [144, 145, 146, 150, 151, NEW_LEGENDARY_IDS];
```

The rarity system uses total stats:
- **Legendary**: Manually specified IDs
- **Rare**: Total stats ≥ 500
- **Uncommon**: Total stats ≥ 400
- **Common**: Total stats < 400

#### 4. Asset Requirements

**For each new Pokemon, you need:**
1. **Image**: `public/pokemon_images/{id:03d}_{name}.png`
   - Downloaded by `download_pokemon_images.py`
   - 475x475px PNG from PokeAPI official artwork

2. **Audio**: `public/pokemon_audio/{id:03d}_{name}.mp3`
   - Generated by `generate_pokemon_audio.py`
   - English TTS pronunciation
   - Format: lowercase name with hyphens removed

3. **Data**: Entry in `src/pokemonData.js`
   - Generated by `fetch_pokemon_data.py`
   - Includes types, stats, height, weight

### Python Script Reference

**`fetch_pokemon_data.py`:**
- Fetches Pokemon data from PokeAPI
- Generates `src/pokemonData.js`
- Requires: `requests` library

**`download_pokemon_images.py`:**
- Downloads official artwork from PokeAPI
- Saves to `public/pokemon_images/`
- Requires: `requests` library

**`generate_pokemon_audio.py`:**
- Generates TTS audio for Pokemon names
- Saves to `public/pokemon_audio/`
- Requires: `edge-tts` library
- Voice: `en-US-GuyNeural`

### Testing After Adding Pokemon

1. **Admin Panel** (`/admin`):
   - Shows correct total: "X / {NEW_TOTAL}"
   - All Pokemon appear in grid
   - Checkboxes work for all Pokemon

2. **Pokedex** (in-game):
   - Shows correct count
   - All Pokemon cards render
   - Caught/uncaught states work

3. **Main Game**:
   - Can encounter new Pokemon
   - Images load correctly
   - Audio plays correctly
   - Catch mechanics work

4. **Console**:
   - No 404 errors for missing assets
   - No missing audio warnings

### Important Files Reference

| File | Purpose | Manual Edit? |
|------|---------|--------------|
| `src/pokemonData.js` | Pokemon data array | ❌ Auto-generated |
| `src/pokemonRarity.js` | Catch rates, legendary IDs | ✅ Update legendaries |
| `src/main.js` | Admin panel | ✅ Already flexible |
| `src/pokedex.js` | Pokedex UI | ✅ Already flexible |
| `src/scenes/BootScene.js` | Asset loading | ✅ Already flexible |
| `fetch_pokemon_data.py` | Data generator | ✅ Update for new gens |
| `download_pokemon_images.py` | Image downloader | ✅ Update for new gens |
| `generate_pokemon_audio.py` | Audio generator | ✅ Update for new gens |

### Common Mistakes to Avoid

❌ **Don't hardcode Pokemon counts** - Use `POKEMON_DATA.length`
❌ **Don't manually edit pokemonData.js** - Use the Python script
❌ **Don't forget to update FILENAME_MAP** - Script will fail without it
❌ **Don't skip running all 3 Python scripts** - Assets must match data
✅ **Do use loops over POKEMON_DATA** - Automatically scales
✅ **Do test admin panel after changes** - Easiest way to verify all Pokemon
✅ **Do update comments from specific numbers** - Keep docs accurate

## TTS Audio Trimming

**CRITICAL: Always trim Edge-TTS files - they have ~240ms start + ~930ms end silence!**

### Quick Guide

1. Generate audio with edge-tts
2. **Trim silence** using script below
3. Result: ~55% smaller files, perfect for audio stitching

### Trimming Script

Use `trim_audio_silence.py`:
```python
import subprocess, os
from pathlib import Path

def trim_audio_file(filepath):
    temp = str(filepath) + ".tmp.mp3"
    subprocess.run([
        'ffmpeg', '-i', str(filepath),
        '-af', 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05:stop_periods=-1:stop_threshold=-50dB:stop_silence=0.05',
        '-y', temp
    ], capture_output=True, check=True)
    os.replace(temp, filepath)

audio_dir = Path('public/YOUR_FOLDER')  # Change this
for f in audio_dir.glob('*.mp3'):
    trim_audio_file(f)
```

### Audio Stitching Timing

After trimming, use 50ms gap for natural speech:
```javascript
const gapMs = 50;
const delayMs = this.firstAudio.duration * 1000 + gapMs;
scene.time.delayedCall(delayMs, () => this.secondAudio.play());
```

Gap guide: 0-50ms = tight, 50-100ms = natural, 100ms+ = slow
