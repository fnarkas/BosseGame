import { getJSON, setJSON, getInt, setInt, has, remove } from './storage.js';

/**
 * Inventory Management System
 * Handles pokeball storage and operations
 */

const INVENTORY_KEY = 'inventory';
const OLD_POKEBALL_KEY = 'pokeballCount';

/**
 * Pokeball types and their prices
 */
export const POKEBALL_TYPES = {
  pokeball: {
    name: 'Poké Ball',
    price: 10,
    catchRate: 1.0,
    emoji: '⚪'
  },
  greatball: {
    name: 'Great Ball',
    price: 50,
    catchRate: 1.2,
    emoji: '🔵'
  },
  ultraball: {
    name: 'Ultra Ball',
    price: 100,
    catchRate: 1.4,
    emoji: '⚫'
  },
  legendaryball: {
    name: 'Legendary Ball',
    price: 500,
    catchRate: 2.0,
    emoji: '👑'
  }
};

/**
 * Get current inventory
 * @returns {Object} Inventory object with pokeball counts
 */
export function getInventory() {
  const stored = getJSON(INVENTORY_KEY, null, v => v && typeof v === 'object' && !Array.isArray(v));
  const inventory = { pokeball: 0, greatball: 0, ultraball: 0, legendaryball: 0 };
  if (stored) {
    // Only keep known ball types with sane counts; anything else is corrupt.
    for (const type of Object.keys(inventory)) {
      const count = parseInt(stored[type], 10);
      inventory[type] = Number.isFinite(count) && count > 0 ? count : 0;
    }
  }
  return inventory;
}

/**
 * Save inventory to localStorage
 * @param {Object} inventory - Inventory object to save
 */
function saveInventory(inventory) {
  setJSON(INVENTORY_KEY, inventory);
}

/**
 * Add a pokeball to inventory
 * @param {string} type - Type of pokeball ('pokeball', 'greatball', 'ultraball')
 * @returns {number} New count for that pokeball type
 */
export function addPokeball(type) {
  if (!POKEBALL_TYPES[type]) {
    console.error(`Invalid pokeball type: ${type}`);
    return 0;
  }

  const inventory = getInventory();
  inventory[type] = (inventory[type] || 0) + 1;
  saveInventory(inventory);
  return inventory[type];
}

/**
 * Remove a pokeball from inventory
 * @param {string} type - Type of pokeball to remove
 * @returns {number|null} New count for that pokeball type, or null if none available
 */
export function removePokeball(type) {
  if (!POKEBALL_TYPES[type]) {
    console.error(`Invalid pokeball type: ${type}`);
    return null;
  }

  const inventory = getInventory();
  if (inventory[type] <= 0) {
    return null; // No pokeballs of this type
  }

  inventory[type] = inventory[type] - 1;
  saveInventory(inventory);
  return inventory[type];
}

/**
 * Set the count of one pokeball type outright (the admin panel). Anything
 * that is not a non-negative integer becomes 0.
 * @param {string} type - Type of pokeball
 * @param {number} count - New count
 * @returns {number|null} The stored count, or null for an unknown type
 */
export function setPokeballCount(type, count) {
  if (!POKEBALL_TYPES[type]) {
    console.error(`Invalid pokeball type: ${type}`);
    return null;
  }
  const inventory = getInventory();
  inventory[type] = clampCount(count);
  saveInventory(inventory);
  return inventory[type];
}

/**
 * Sanitise a count entered by hand: integer, never negative, never absurd.
 */
export const MAX_ITEM_COUNT = 9999;
export function clampCount(value, max = MAX_ITEM_COUNT) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, max);
}

/**
 * Check if player has any pokeballs
 * @returns {boolean} True if player has at least one pokeball
 */
export function hasPokeballs() {
  const inventory = getInventory();
  return inventory.pokeball > 0 || inventory.greatball > 0 || inventory.ultraball > 0 || inventory.legendaryball > 0;
}

/**
 * Get total count of all pokeballs
 * @returns {number} Total pokeball count
 */
export function getTotalPokeballCount() {
  const inventory = getInventory();
  return inventory.pokeball + inventory.greatball + inventory.ultraball + inventory.legendaryball;
}

/**
 * Check if player has a specific type of pokeball
 * @param {string} type - Type of pokeball to check
 * @returns {boolean} True if player has at least one of this type
 */
export function hasPokeball(type) {
  const inventory = getInventory();
  return inventory[type] > 0;
}

/**
 * Migrate old pokeball count to new inventory system
 * Should be called on game initialization
 */
export function migrateOldInventory() {
  // Check if already migrated
  if (has(INVENTORY_KEY)) {
    return; // Already using new system
  }

  // Check for old pokeball count
  const oldCount = getInt(OLD_POKEBALL_KEY, -1);
  if (oldCount >= 0) {
    const count = oldCount;
    const inventory = {
      pokeball: count,
      greatball: 0,
      ultraball: 0,
      legendaryball: 0
    };
    saveInventory(inventory);

    // Initialize coin count if not exists
    if (!has('coinCount')) {
      setInt('coinCount', 0);
    }

    // Clean up old key
    remove(OLD_POKEBALL_KEY);
    console.log(`Migrated ${count} pokeballs to new inventory system`);
  } else {
    // No old data, initialize fresh inventory
    saveInventory({
      pokeball: 5, // Start with 5 pokeballs as per original design
      greatball: 0,
      ultraball: 0,
      legendaryball: 0
    });

    // Initialize coin count
    if (!has('coinCount')) {
      setInt('coinCount', 0);
    }
  }
}
