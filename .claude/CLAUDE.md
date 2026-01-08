# Claude Code Instructions

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
