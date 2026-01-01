# Pokemon Bokstavs-Spel - Game Plan

## Overview
An educational game for learning the Swedish alphabet by catching Pokemon. Players match lowercase and uppercase letters to catch Pokemon.

## Core Game Flow
1. **Pokemon appears** in the wild (random from 100 Pokemon)
2. **Challenge starts**: Show a lowercase letter (e.g., "a", "ö", "å")
3. **Player drags** the correct capital letter ("A", "Ö", "Å") to match it
4. **3 attempts max** - if successful, Pokemon is caught! If failed, Pokemon runs away
5. **Pokedex** shows all caught Pokemon

## Swedish Alphabet
- **29 letters**: A-Z + Å Ä Ö
- Both uppercase and lowercase versions for matching
- Proper Swedish letter order (Å Ä Ö at the end)

## Anti-Brute-Force Strategy
- After each wrong attempt, that wrong letter is disabled/grayed out
- This teaches the correct answer rather than allowing random guessing
- Visual feedback shows which letters have been tried
- Maximum 3 attempts per Pokemon

## Technical Architecture

### Framework
- **Phaser 3** - 2D game framework for animations, sprites, and game logic

### Game Scenes
1. **BootScene** - Load assets, show loading screen
2. **MainGameScene** - Main gameplay (Pokemon appears, letter challenge)
3. **PokedexScene** - View all caught Pokemon in a grid

### Key Features
- Drag-and-drop letter tiles (capital letters A-Ö available)
- Smooth animations for Pokemon appearing/running away
- Local storage to save caught Pokemon between sessions
- Visual feedback (hearts/attempts remaining)
- Pokemon images from `pokemon_images/` directory (100 Pokemon)

### Assets
- Pokemon images: `pokemon_images/001_bulbasaur.png` through `pokemon_images/100_*.png`
- Letter rendering: Text-based (Phaser text objects)
- UI elements: Created programmatically or simple graphics

## Phase 1 Implementation (MVP)
1. Set up Phaser 3 project with HTML, CSS, and basic structure
2. Create game scenes (Boot, MainGame, Pokedex)
3. Implement Pokemon spawning system with random selection
4. Create letter matching challenge UI with Swedish alphabet (A-Ö)
5. Implement drag-and-drop mechanics for letter matching
6. Add anti-brute-force logic (3 attempts, track used letters)
7. Create Pokemon catch animation and success screen
8. Create Pokemon run away animation and fail screen
9. Implement Pokedex scene to display caught Pokemon
10. Add local storage to persist caught Pokemon data

## Phase 2 Features (Future)
- **Pokeball system**: Limited attempts before needing to "restock"
- **Different challenge types**:
  - Match words
  - Spell Pokemon names
  - Identify letter sounds
- **Difficulty levels**: Adjust number of attempts, time limits
- **Sound effects and background music**
- **Statistics**: Track success rate, favorite Pokemon
- **Rewards system**: Unlock rare Pokemon after X catches

## Game Data Structure

### Caught Pokemon Storage (localStorage)
```json
{
  "caughtPokemon": [
    {
      "id": 1,
      "name": "bulbasaur",
      "caughtDate": "2026-01-01T12:00:00Z"
    }
  ]
}
```

### Pokemon Data
- Load from filenames in `pokemon_images/`
- Format: `{id}_{name}.png`
- 100 Pokemon total

## UI/UX Considerations
- Large, child-friendly buttons and letters
- Bright colors and clear visual feedback
- Encouraging messages for both success and failure
- Simple, intuitive drag-and-drop
- Clear indication of attempts remaining
- Celebration animations when catching Pokemon
