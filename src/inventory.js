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
  }
};

/**
 * Get current inventory
 * @returns {Object} Inventory object with pokeball counts
 */
export function getInventory() {
  const inventoryStr = localStorage.getItem(INVENTORY_KEY);
  if (inventoryStr) {
    return JSON.parse(inventoryStr);
  }

  // Return default empty inventory
  return {
    pokeball: 0,
    greatball: 0,
    ultraball: 0
  };
}

/**
 * Save inventory to localStorage
 * @param {Object} inventory - Inventory object to save
 */
function saveInventory(inventory) {
  localStorage.setItem(INVENTORY_KEY, JSON.stringify(inventory));
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
 * Check if player has any pokeballs
 * @returns {boolean} True if player has at least one pokeball
 */
export function hasPokeballs() {
  const inventory = getInventory();
  return inventory.pokeball > 0 || inventory.greatball > 0 || inventory.ultraball > 0;
}

/**
 * Get total count of all pokeballs
 * @returns {number} Total pokeball count
 */
export function getTotalPokeballCount() {
  const inventory = getInventory();
  return inventory.pokeball + inventory.greatball + inventory.ultraball;
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
  if (localStorage.getItem(INVENTORY_KEY)) {
    return; // Already using new system
  }

  // Check for old pokeball count
  const oldCount = localStorage.getItem(OLD_POKEBALL_KEY);
  if (oldCount) {
    const count = parseInt(oldCount, 10);
    const inventory = {
      pokeball: count,
      greatball: 0,
      ultraball: 0
    };
    saveInventory(inventory);

    // Initialize coin count if not exists
    if (!localStorage.getItem('coinCount')) {
      localStorage.setItem('coinCount', '0');
    }

    // Clean up old key
    localStorage.removeItem(OLD_POKEBALL_KEY);
    console.log(`Migrated ${count} pokeballs to new inventory system`);
  } else {
    // No old data, initialize fresh inventory
    saveInventory({
      pokeball: 5, // Start with 5 pokeballs as per original design
      greatball: 0,
      ultraball: 0
    });

    // Initialize coin count
    if (!localStorage.getItem('coinCount')) {
      localStorage.setItem('coinCount', '0');
    }
  }
}
