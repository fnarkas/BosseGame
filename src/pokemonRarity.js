/**
 * Pokemon Rarity and Catch Rate System
 */

import { POKEMON_DATA } from './pokemonData.js';

// Rarity tiers
export const RARITY_TIERS = {
  common: {
    baseCatchRate: 0.75, // 75%
    stars: 0,
    icon: ''
  },
  uncommon: {
    baseCatchRate: 0.30, // 30%
    stars: 1,
    icon: '⭐'
  },
  rare: {
    baseCatchRate: 0.15, // 15%
    stars: 2,
    icon: '⭐⭐'
  },
  legendary: {
    baseCatchRate: 0.03, // 3%
    stars: 3,
    icon: '✨👑✨'
  }
};

// Legendary and mythical Pokemon IDs, all generations (the pool grows as the
// player completes the Pokedex, see pokemonPool.js)
const LEGENDARY_IDS = [
    144, 145, 146, 150, 151, // Gen 1: Articuno, Zapdos, Moltres, Mewtwo, Mew
    243, 244, 245, 249, 250, 251, // Gen 2: Raikou, Entei, Suicune, Lugia, Ho-oh, Celebi
    377, 378, 379, 380, 381, 382, 383, 384, 385, 386, // Gen 3: Regis, Latias/Latios, weather trio, Jirachi, Deoxys
    480, 481, 482, 483, 484, 485, 486, 487, 488, 489, 490, 491, 492, 493, // Gen 4
    494, 638, 639, 640, 641, 642, 643, 644, 645, 646, 647, 648, 649, // Gen 5
    716, 717, 718, 719, 720, 721, // Gen 6
    772, 773, 785, 786, 787, 788, 789, 790, 791, 792, 800, 801, 802, 807, 808, 809, // Gen 7
    888, 889, 890, 891, 892, 893, 894, 895, 896, 897, 898, 905, // Gen 8
    1001, 1002, 1003, 1004, 1007, 1008, 1014, 1015, 1016, 1017, 1020, 1021, 1022, 1023, 1024, 1025 // Gen 9
];

/**
 * Get Pokemon rarity based on stats and special overrides
 * @param {Object} pokemon - Pokemon data object
 * @returns {string} Rarity tier ('common', 'uncommon', 'rare', 'legendary')
 */
export function getPokemonRarity(pokemon) {
  // Check if legendary
  if (LEGENDARY_IDS.includes(pokemon.id)) {
    return 'legendary';
  }

  // Calculate total base stats
  const totalStats = Object.values(pokemon.stats).reduce((sum, stat) => sum + stat, 0);

  // Classify by total stats
  if (totalStats >= 500) {
    return 'rare';
  } else if (totalStats >= 400) {
    return 'uncommon';
  } else {
    return 'common';
  }
}

/**
 * Get base catch rate for a Pokemon
 * @param {Object} pokemon - Pokemon data object
 * @returns {number} Base catch rate (0.0 to 1.0)
 */
export function getBaseCatchRate(pokemon) {
  const rarity = getPokemonRarity(pokemon);
  return RARITY_TIERS[rarity].baseCatchRate;
}

/**
 * Calculate final catch probability
 * @param {Object} pokemon - Pokemon data object
 * @param {number} pokeballMultiplier - Pokeball catch rate multiplier (from POKEBALL_TYPES)
 * @param {string} ballType - Type of pokeball being used ('pokeball', 'greatball', 'ultraball', 'legendaryball')
 * @returns {number} Final catch probability (0.0 to 1.0, capped at 1.0)
 */
export function calculateCatchProbability(pokemon, pokeballMultiplier, ballType = 'pokeball') {
  const rarity = getPokemonRarity(pokemon);
  const rarityInfo = RARITY_TIERS[rarity];

  // Guaranteed catches:
  // Great Ball always catches 1-star (uncommon) Pokemon
  if (ballType === 'greatball' && rarityInfo.stars === 1) {
    return 1.0;
  }

  // Ultra Ball always catches 2-star (rare) Pokemon
  if (ballType === 'ultraball' && rarityInfo.stars === 2) {
    return 1.0;
  }

  // Legendary Ball always catches all Pokemon (guaranteed)
  if (ballType === 'legendaryball') {
    return 1.0;
  }

  const baseCatchRate = getBaseCatchRate(pokemon);
  const finalRate = baseCatchRate * pokeballMultiplier;
  return Math.min(finalRate, 1.0); // Cap at 100%
}

/**
 * Attempt to catch a Pokemon
 * @param {Object} pokemon - Pokemon data object
 * @param {number} pokeballMultiplier - Pokeball catch rate multiplier
 * @param {boolean} isTutorial - If true, always succeed (for tutorial Pokemon)
 * @param {string} ballType - Type of pokeball being used ('pokeball', 'greatball', 'ultraball', 'legendaryball')
 * @returns {boolean} True if catch succeeded, false if failed
 */
export function attemptCatch(pokemon, pokeballMultiplier, isTutorial = false, ballType = 'pokeball') {
  // Tutorial mode: always succeed
  if (isTutorial) {
    console.log(`Tutorial catch: ${pokemon.name} - GUARANTEED SUCCESS`);
    return true;
  }

  const catchProbability = calculateCatchProbability(pokemon, pokeballMultiplier, ballType);
  const roll = Math.random();

  const success = roll < catchProbability;
  console.log(`Catch attempt: ${pokemon.name} with ${(catchProbability * 100).toFixed(1)}% chance - ${success ? 'SUCCESS' : 'FAILED'} (rolled ${(roll * 100).toFixed(1)}%)`);

  return success;
}

/**
 * Get rarity display info for a Pokemon
 * @param {Object} pokemon - Pokemon data object
 * @returns {Object} Rarity info with stars and icon
 */
export function getRarityInfo(pokemon) {
  const rarity = getPokemonRarity(pokemon);
  return {
    tier: rarity,
    ...RARITY_TIERS[rarity]
  };
}
