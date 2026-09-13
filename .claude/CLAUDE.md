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

All minigame wiring lives in **one place**: `src/minigameRegistry.js`. The debug
route, the admin panel's "Try a game" tab, the forced-mode value, the weighted random pick, the
reload-restore map, the wheel slice/colour/icon, the default weight and the admin
probability form are all derived from that list. Do NOT add if/else chains or
hand-written maps anywhere else.

### 1. Create the game mode class
- **Location**: `src/pokeballGameModes/YourGameMode.js`, extends `BasePokeballGameMode`
- **Required methods**: `generateChallenge()`, `createChallengeUI(scene)`, `cleanup(scene)` (must call `super.cleanup(scene)`)
- Push every game object into `this.uiElements`; schedule with `this.delayedCall` / `this.addTween`
- Report the win once with `this.finish(true, answer, x, y)`
- Optional `async loadConfig()` that sets `this.configLoaded = true` (the scene awaits it before the first challenge)
- Optional `paysOwnCoins = true` + `earnedCoins` for timed modes that compute their own payout
- Keep word lists / data in a separate file (e.g. `src/speechVocabulary.js`)

### 2. Register it
Add one line to `MINIGAMES` in `src/minigameRegistry.js`:
```javascript
{ key: 'yourMode', Mode: YourGameMode, path: '/yourmode', forced: 'yourmode-only',
  name: '🎮 Your Mode', icon: 'game-mode-yourmode', iconFile: 'minigame_icons/your_mode.png',
  color: 0x123456, defaultWeight: 10 }
```
- `key` is the weight key in `public/config/minigames.json` (add it there too if you want a non-default weight)
- `slice: 'shared-name'` makes two modes share one wheel slice (listening/reading pairs)
- `audio: ['words']` lists the audio packs (see `src/assetManifest.js`) the mode needs; they are
  downloaded the first time the mode starts. Letters, numbers, directions and "gånger" are always loaded.
- `legendary: true` for fixed-reward, no-streak, treasure-chest modes

### 3. Create the icon
`public/minigame_icons/your_mode.png`, 256x256, transparent background, bold and
recognisable by a 5-year-old (emoji or simple shapes, high contrast).

### 4. Add tests
`test/modes/yourMode.test.js` — see the Automated Tests section. `test/minigameRegistry.test.js`
already checks that every `*Mode.js` file is registered, that icons exist and that config
keys match, so it will fail loudly if step 2 or 3 is skipped.

### 5. Admin config section (optional)
If the mode reads its own section of `minigames.json` (via `loadModeConfig('yourMode', defaults)`),
add one entry to `MINIGAME_CONFIG_SCHEMA` in `src/admin/schema.js` listing its fields
(`{ id, label, type, default, min, max, help }`). The panel, save and validation are generated
from that; `test/admin/schema.test.js` checks it against the config file.

### Testing checklist
- ✅ Debug path works: `http://localhost:5173/yourmode`
- ✅ Appears on the wheel and in random rotation
- ✅ UI cleanup works (no leftover elements after mode switch)
- ✅ `npm test` passes, including the registry and lint tests
- ✅ No console errors

### Example reference
See `AdditionMode.js` for a compact mode and `SpeechRecognitionMode.js` for one with config and microphone handling.

## Pokemon Management System

**IMPORTANT: The game uses a flexible architecture that dynamically adapts to the number of Pokemon in `POKEMON_DATA`.**

### Current State
- **All 1025 Pokemon (Generations 1-9)** are in `POKEMON_DATA`, with artwork and name audio
- **How many are in the game is a per-account setting**: `pokedex.maxPokemonId` in
  `public/config/minigames.json` (default 151), edited on the Pokédex tab of `/admin` (generation
  presets). `src/pokemonPool.js` owns it: `getAvailablePokemon()` / `isPokemonAvailable(id)` are the
  only way to list catchable/visible Pokemon, and `applyPokedexConfig()` is awaited in BootScene and
  when the admin opens an account. Never filter `POKEMON_DATA` by id anywhere else.
- **Completing the pool unlocks more**: when every Pokemon in the pool is caught, `MainGameScene`
  plays the big celebration (`src/pokedexCelebration.js`) and `src/pokedexUnlock.js` raises
  `pokedex.maxPokemonId` in the account's config override to the next 151+n*100 boundary. The party
  only follows a catch (`pokedexCelebrationDue`): a pool that is already full at encounter time
  (admin "Catch all", a save that was full before unlocking existed) quietly gets ONE more Pokemon,
  and the celebration comes when that one is caught. This is the one place the game writes config.
- **Encounter order is a saved queue** (`src/spawnQueue.js`, key `pokemonSpawnQueue`): the tutorial
  trio first, then random uncaught Pokemon. `MainGameScene.spawnPokemon()` calls `takeNextSpawn()`;
  the admin Pokédex tab shows the next 10 and can push a chosen Pokemon to the front (`queueSpawn`).
- **Presents**: the admin can also queue a gift (`queueGift`, `src/gifts.js`), an entry
  `{ gift: { coins, pokeball, greatball, ultraball, legendaryball }, pinned: true }`. The catching
  scene shows a tappable gift box instead of a Pokemon (`showGift`) and grants the contents; a present
  can be opened with an empty bag. Only the admin panel creates gifts.
- Legendary/mythical Pokemon carry `legendary: true` in the data (from PokeAPI species data)

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

### Adding New Pokemon (beyond #1025)

**Follow these steps in order:**

#### 1. Update Python Scripts

**`download_pokemon_images.py`:**
- Update the `num_pokemon` in the main call to the new total
- Run: `python3 download_pokemon_images.py`, then `python3 optimize_pokemon_images.py` (256 px, idempotent)

**`fetch_pokemon_data.py`:**
- Needs no edits: it scans `public/pokemon_images/` for the ids and fetches data + the
  legendary/mythical flag for each
- It stores the *species* name ("Deoxys", not "deoxys-normal") because the child spells it
- Run: `python3 fetch_pokemon_data.py`

**`generate_pokemon_audio.py`:**
- Needs no edits: it reads the names from `src/pokemonData.js`, generates the missing files
  and trims the Edge-TTS silence from all of them
- Run: `python3 generate_pokemon_audio.py`

**`src/pokemonPool.js`:** add the new generation's last dex number to `GENERATIONS` so the
admin panel gets a preset for it.

#### 2. Verify Flexible Code (Should NOT need changes)

These files already use `POKEMON_DATA.length` and will automatically adapt:

**✅ Already Flexible:**
- `src/pokemonPool.js` - `getAvailablePokemon()`, unlock ceiling clamped to `POKEMON_DATA.length`
- `src/pokedex.js` and `src/admin/sections/pokemon.js` - render `getAvailablePokemon()`
- `src/assetManifest.js` - `pokemonImageAsset(id)` / `pokemonAudioAsset(id)` build paths from `POKEMON_DATA`;
  artwork and name audio are loaded lazily per encounter (`MainGameScene`), not in BootScene
- `test/assets.test.js` - fails if any Pokemon in the data lacks artwork or name audio

**⚠️ Check for Hardcoded Values:**
If you find any hardcoded Pokemon counts (like "100" or "151"), replace with:
- In template strings: `${POKEMON_DATA.length}`
- In loops: `POKEMON_DATA.forEach(...)` or `for (const pokemon of POKEMON_DATA)`
- In comments: Update to say "all Pokemon" instead of specific numbers

#### 3. Update Rarity System (if needed)

**File**: `src/pokemonRarity.js`

Legendary and mythical Pokemon are flagged `legendary: true` in `src/pokemonData.js` by
`fetch_pokemon_data.py` (PokeAPI species data), so new generations need no code change. To
hand-pick extra ones:
```javascript
const LEGENDARY_IDS = [144, 145, 146, 150, 151, EXTRA_IDS];
```

The rarity system uses total stats:
- **Legendary**: `legendary` flag in the data, or manually specified IDs
- **Rare**: Total stats ≥ 500
- **Uncommon**: Total stats ≥ 400
- **Common**: Total stats < 400

#### 4. Asset Requirements

**For each new Pokemon, you need:**
1. **Image**: `public/pokemon_images/{id:03d}_{name}.png`
   - Downloaded by `download_pokemon_images.py`
   - PNG from PokeAPI official artwork (`optimize_pokemon_images.py` shrinks them)

2. **Audio**: `public/pokemon_audio/{id:03d}_{name}.mp3`
   - Generated by `generate_pokemon_audio.py`
   - English TTS pronunciation, silence trimmed
   - Format: lowercase name with all hyphens removed (must match `pokemonAudioAsset()`)

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
| `src/pokemonPool.js` | Unlocked pool, batch unlocking | ✅ Already flexible |
| `src/pokedexCelebration.js` | Completed-Pokedex show | ✅ |
| `src/pokemonRarity.js` | Catch rates, legendary IDs | ✅ Update legendaries |
| `src/admin/sections/pokemon.js` | Admin Pokédex tab | ✅ Already flexible |
| `src/pokedex.js` | Pokedex UI | ✅ Already flexible |
| `src/assetManifest.js` | Asset paths, lazy audio packs | ✅ Already flexible |
| `src/scenes/BootScene.js` | Boot-time asset loading (small set) | ✅ Already flexible |
| `fetch_pokemon_data.py` | Data generator | ✅ Update for new gens |
| `download_pokemon_images.py` | Image downloader | ✅ Update for new gens |
| `generate_pokemon_audio.py` | Audio generator | ✅ Update for new gens |

### Common Mistakes to Avoid

❌ **Don't hardcode Pokemon counts** - Use `getAvailablePokemon().length` / `POKEMON_DATA.length`
❌ **Don't filter on a fixed max id** - the unlocked ceiling grows; use `src/pokemonPool.js`
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

## Automated Tests

Run `npm test` (vitest, Node). Phaser can't run headless, so the minigames are
exercised against `test/helpers/fakeScene.js` — see `test/README.md`.

### Rules for game modes (enforced by `test/lint.test.js`)
- Schedule with `this.delayedCall(scene, ms, fn)` and `this.addTween(scene, cfg)`,
  never `scene.time.delayedCall` / `scene.tweens.add` directly — `cleanup()`
  cancels them so an old challenge can't rebuild UI over the next mode.
- Report the win with `this.finish(true, answer, x, y)` (fires once), not
  `this.answerCallback(...)`.
- `cleanup()` must call `super.cleanup(scene)`; push every game object into
  `this.uiElements` (particles too).
- Gate taps with `this.inputLocked` while an answer is being resolved; reset it at
  the top of `createChallengeUI()`.
- Never read `.destroyed` on a game object (Phaser has no such flag); use `obj.scene`.
- Every new mode needs `test/modes/<name>.test.js`: generation invariants, happy path
  to exactly one reward, wrong-answer path, double-tap lockout, cleanup + 10 s
  advance leaves no orphaned objects, and no unknown audio keys.

## Shared Modules (use these, never re-implement)

| Need | Use | Never |
|---|---|---|
| Read/write saved state | `src/storage.js` (`getJSON/setJSON/getInt/...`) — in memory, synced to the server per account by `src/account.js` | raw `localStorage.*` (only device settings like volume live there) |
| Accounts / login | `login()`, `logout()` in `src/account.js`; `ensureLoggedIn()` in `src/login.js`; API in `server/api.js`, SQLite in `server/db.js` (`data/game.db`) | a second persistence path or `fetch('/api/...')` outside `account.js` |
| Caught Pokemon list | `src/caughtPokemon.js` | parsing `pokemonCaughtList` yourself |
| Config from `minigames.json` | `loadModeConfig('section', defaults)` in `src/minigameConfig.js` (one cached fetch) | `fetch('/config/minigames.json')` |
| Play a sound | in modes `this.playAudio(scene, key)` / `this.playSequence(scene, keys)`; elsewhere `playAudio(scene, key)` from `src/audio.js` | `scene.sound.play(key)` (throws on a missing key) |
| Right/wrong chime | `playChime(scene, 'correct'|'wrong'|'fanfare')` from `src/sfx.js` | new audio files for UI feedback |
| Wrong-answer flow | `this.shakeWrong()` → `this.revealAnswer({ targets, audioKey })` → `restartChallenge()` | hand-written red/gold tweens |
| Progress / hearts / speaker / stars | `this.createProgressBalls`, `this.createHearts`, `this.createSpeakerButton`, `this.showSuccessParticles` | per-mode copies |
| Which item to ask next | `pickAdaptive(modeName, pool, { seedList })`, `pickDistractors(...)`, `this.takeRetry()` / `queueRetry()` from `src/adaptive.js` + base | uniform `GetRandom` for letters/numbers |
| Number list from admin ("12-20,30") | `parseNumberRange(str, fallback)` in `src/utils/parseNumberRange.js` | a local parser |
| Colours / text styles / layout | `COLORS`, `TEXT`, `LAYOUT` in `src/pokeballGameModes/uiKit.js` | new hex literals |

### Live sync (admin changes reach a running game)
- `src/account.js` polls `GET /api/state?since=<revision>` every few seconds and on tab focus, and
  applies whatever another device (usually `/admin`) wrote via `applyRemoteState` (unsent local
  changes win). The `minigameConfig` key also drops the config cache.
- **Views re-read at their entry points, never mid-view**: `selectRandomGameMode()` pulls before
  rolling and `refreshWheel()` redraws the wheel if the enabled slices changed; the catching scene
  pulls before drawing the next Pokemon from the spawn queue; modes get a fresh instance per spin.
- Something that must redraw immediately (a coin counter, the pokeball HUD) subscribes with
  `onRemoteChange(keys => ...)` and unsubscribes on scene shutdown. `src/liveUpdates.js` holds the
  game-wide reactions (registry copy of the caught list, the Pokemon pool size).

### Learning rules every mode follows
- A wrong answer is always followed by the correct answer being **spoken** while it is highlighted (`revealAnswer` with `audioKey`/`audioKeys`).
- The missed item is asked again right away and once more a little later (`queueRetry(item)` and `queueRetry(item, 2)`).
- Keep calling `trackWrongAnswer(...)` — that data drives the adaptive picker.
- `/admin` edits one account at a time. Its saves go into that account's state under `minigameConfig`
  (`setAccountConfigOverride` in `src/minigameConfig.js`), which overrides whole sections of
  `public/config/minigames.json`; the game itself never writes the config. Saving works in
  production too (it is ordinary account state).

## Deploying to the family server

`npm run deploy` from the dev machine: runs the tests, builds, rsyncs `dist/`, `server/` and
`deploy/` to `oloflandin@Olofs-Mac-mini.local:~/srv/pokemon` and runs `deploy/install.sh` there, which
(re)writes the launchd agents and restarts the server. The database, certificate, backups and
logs live in `~/srv/pokemon-data` on the server and are never uploaded or deleted.
The server speaks HTTPS with a self-signed certificate on the LAN (`https://olofs-mac-mini.local/`);
when Tailscale is running on the server, `install.sh` also sets up Tailscale Serve so the game is
reachable on the tailnet at `https://olofs-mac-mini.<tailnet>.ts.net:8443/` with a trusted certificate
(`POKEMON_TAILSCALE=0` skips that). Serve must not use 443: the Tailscale app binds its Serve port on
every interface whenever that port is free, which takes 443 from the Node server (EADDRINUSE on
every start until the Serve is switched off; `install.sh` does that before restarting).
`DEPLOY_HOST` / `DEPLOY_DIR` override the target. Never run `deploy/install.sh` on the dev machine.
