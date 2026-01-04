# Currency & Store System - Implementation Plan

## Overview
Transform the pokeball reward system into a coin-based economy with a store where players can purchase different types of pokeballs.

---

## Current System (To Be Changed)

### Current Behavior:
- **Pokeball Games** (Left/Right, Letter Listening, Word-Emoji Match): Award 1 pokeball immediately on success
- **Storage**: Single `pokeballCount` value in localStorage
- **Display**: Pokeball icon + count in top-right corner
- **Usage**: Pokeballs consumed when catching Pokemon in main game

---

## New System Design

### 1. Currency System

#### Coin Rewards:
- **Tasks award coins instead of pokeballs**
- **Random amount**: 1-3 coins per completed task
- **Storage**: `coinCount` in localStorage
- **Display**: Coin icon + count (always visible)

#### Reward Animation:
1. **Wrapped Gift Box** appears when task is completed
2. **Jiggle Animation** - Gift box shakes/wiggles
3. **Explosion Effect** - Particle burst when gift opens
4. **Coins Revealed** - Show "+X coins" text with the amount earned
5. **Counter Update** - Animate coin counter increasing

---

### 2. Store System

#### Store Location:
- **Route**: `/store`
- **Access**: Button/link from main game scene
- **Implementation**: HTML overlay (like Pokedex)

#### Pokeball Types & Prices:
| Pokeball Type | Cost (Coins) | Catch Success Rate |
|---------------|--------------|-------------------|
| Regular (Poke Ball) | 10 coins | Standard |
| Great Ball | 50 coins | Higher |
| Ultra Ball | 100 coins | Highest |

#### Store UI Components:
1. **Header**: "Pokeball Store" title
2. **Coin Balance**: Display current coins
3. **Pokeball Cards**: 3 cards showing:
   - Pokeball image
   - Name
   - Price in coins
   - Current inventory count
   - "Buy" button (disabled if not enough coins)
4. **Back Button**: Return to game

#### Purchase Flow:
1. Click "Buy" button
2. Deduct coins from balance
3. Add 1 pokeball to inventory
4. Update displays
5. Show confirmation feedback

---

### 3. Inventory System

#### Data Structure:
```javascript
// localStorage
{
  coinCount: number,
  inventory: {
    pokeball: number,    // Regular Poke Balls
    greatball: number,   // Great Balls
    ultraball: number    // Ultra Balls
  }
}
```

#### Inventory Display:
**Always visible in game scenes:**
- **Coins**: 🪙 x123
- **Pokeballs**:
  - Regular: ⚪ x5
  - Great: 🔵 x2
  - Ultra: ⚫ x1

**Placement Options:**
- Top-right corner (current pokeball location)
- Compact HUD element
- Expandable inventory button

---

### 4. Game Integration

#### Pokemon Catching Flow:
1. **Select Pokeball Type**:
   - Before throwing, player chooses which pokeball to use
   - Options shown: Regular / Great / Ultra (only if have inventory)
   - Different catch rates based on type

2. **Catch Success**:
   - Regular: Base success rate
   - Great: +20% success rate
   - Ultra: +40% success rate

3. **Pokeball Consumption**:
   - Deduct 1 from selected pokeball type inventory
   - Update display

#### No Pokeballs Flow:
- If inventory is empty: Show "No Pokeballs" message
- Direct to Store or Pokeball Game scenes

---

## Implementation Steps

### Phase 1: Currency System
**Files to modify:**
- `src/scenes/PokeballGameScene.js`
- `src/pokeballGameModes/LeftRightMode.js`
- `src/pokeballGameModes/LetterListeningMode.js`
- `src/pokeballGameModes/WordEmojiMatchMode.js`

**Changes:**
1. Replace `pokeballCount++` with coin reward logic
2. Implement random coin amount (1-3)
3. Create gift box reward animation component
4. Update localStorage to store coins separately

**New Files:**
- `src/rewardAnimation.js` - Gift box animation logic
- `src/currency.js` - Currency management utilities

### Phase 2: Gift Box Animation
**Visual Requirements:**
- Gift box sprite or emoji 🎁
- Jiggle/shake animation (CSS or Phaser tweens)
- Particle explosion effect
- Coin reveal animation
- "+X coins" text animation

**Animation Sequence:**
1. Gift box appears (scale in)
2. Jiggle for ~1 second
3. Explosion particle burst
4. Show coin amount with sparkle effect
5. Fade out and update counter

### Phase 3: Inventory System
**Files to create:**
- `src/inventory.js` - Inventory management

**Data Functions:**
```javascript
// Get coin count
getCoinCount()

// Add coins
addCoins(amount)

// Get pokeball inventory
getInventory()

// Add pokeball to inventory
addPokeball(type) // 'pokeball', 'greatball', 'ultraball'

// Remove pokeball from inventory
removePokeball(type)

// Check if has pokeballs
hasPokeballs()

// Get total pokeball count
getTotalPokeballCount()
```

### Phase 4: Store UI
**Files to create:**
- `src/store.js` - Store logic
- Add HTML structure to `index.html`
- Add CSS to `styles.css`

**HTML Structure:**
```html
<div id="store-overlay">
  <div class="store-header">
    <button class="back-button">← Back</button>
    <h1>Pokeball Store</h1>
    <div class="coin-balance">🪙 x123</div>
  </div>
  <div class="store-grid">
    <!-- 3 pokeball cards -->
  </div>
</div>
```

**Store Features:**
- Purchase with click
- Disable buy button if not enough coins
- Visual feedback on purchase
- Update all counters in real-time

### Phase 5: Inventory Display
**Files to modify:**
- `src/scenes/MainGameScene.js`
- `src/scenes/PokeballGameScene.js`

**Display Components:**
- Coin counter (🪙)
- Pokeball inventory (⚪🔵⚫ with counts)
- Compact HUD design

**Placement:**
- Top-right corner of game canvas
- Or HTML overlay element

### Phase 6: Pokeball Selection
**Files to modify:**
- `src/scenes/MainGameScene.js`

**UI Flow:**
1. Add pokeball selection UI before throw
2. Show available pokeballs with counts
3. Highlight selected type
4. Adjust catch rate based on type
5. Update inventory on use

**Catch Rate Modifiers:**
```javascript
const CATCH_RATES = {
  pokeball: 1.0,    // 100% base
  greatball: 1.2,   // 120% (20% boost)
  ultraball: 1.4    // 140% (40% boost)
};
```

### Phase 7: URL Routing
**Files to modify:**
- `src/main.js`

**Add `/store` route:**
```javascript
if (path === '/store' || path === '/store/') {
    startScene = 'MainGameScene'; // Or dedicated StoreScene
    // Show store overlay on load
}
```

---

## Testing Checklist

### Currency System:
- [ ] Completing tasks awards 1-3 random coins
- [ ] Gift box appears after task completion
- [ ] Gift box jiggles/shakes
- [ ] Explosion particle effect works
- [ ] Coin amount is revealed
- [ ] Coin counter updates correctly
- [ ] Coins persist in localStorage

### Store System:
- [ ] Store accessible via `/store` route
- [ ] Store displays correct coin balance
- [ ] All 3 pokeball types shown with prices
- [ ] Cannot buy if insufficient coins
- [ ] Purchase deducts coins correctly
- [ ] Purchase adds pokeball to inventory
- [ ] Inventory updates immediately
- [ ] Back button returns to game

### Inventory System:
- [ ] Inventory displays in all scenes
- [ ] Coin count always visible
- [ ] Pokeball counts by type visible
- [ ] Counts update in real-time
- [ ] Data persists in localStorage
- [ ] Can select pokeball type before throw
- [ ] Different catch rates work correctly
- [ ] Pokeball consumed on throw

### Edge Cases:
- [ ] No coins - cannot buy
- [ ] No pokeballs - show message
- [ ] Catch with different ball types
- [ ] LocalStorage migration from old system

---

## Assets Needed

### Images:
- Gift box sprite or use emoji 🎁
- Coin sprite or use emoji 🪙
- Great Ball sprite (already have)
- Ultra Ball sprite (already have)

### Sounds (Optional):
- Coin collect sound
- Purchase confirmation sound
- Gift box opening sound

---

## Migration Strategy

### Migrating Existing Players:
```javascript
// On game load, check for old pokeballCount
const oldCount = localStorage.getItem('pokeballCount');
if (oldCount && !localStorage.getItem('inventory')) {
  // Convert old pokeballs to new inventory
  const inventory = {
    pokeball: parseInt(oldCount),
    greatball: 0,
    ultraball: 0
  };
  localStorage.setItem('inventory', JSON.stringify(inventory));
  localStorage.setItem('coinCount', '0');
  localStorage.removeItem('pokeballCount'); // Clean up
}
```

---

## Future Enhancements

### Possible Additions:
1. **Master Ball** - 500 coins, 100% catch rate
2. **Special Pokeballs** - Different effects (Timer Ball, Dusk Ball, etc.)
3. **Coin Bundles** - Buy multiple pokeballs at discount
4. **Daily Rewards** - Free coins each day
5. **Achievements** - Bonus coins for milestones
6. **Coin Multipliers** - Power-ups that increase coin rewards

---

## Notes

- **Design Principle**: Game is for 5-year-old non-readers
  - Use emojis and icons heavily
  - Minimal text
  - Visual feedback important
  - Simple, intuitive UI

- **Performance**: Keep animations smooth and lightweight

- **Accessibility**: Ensure touch-friendly buttons and clear visual states

---

**Created:** 2026-01-04
**Status:** Planning
**Priority:** High - Major Feature
