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

// Legendary Pokemon IDs (Gen 1)
const LEGENDARY_IDS = [144, 145, 146, 150, 151]; // Articuno, Zapdos, Moltres, Mewtwo, Mew

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
 * @returns {number} Final catch probability (0.0 to 1.0, capped at 1.0)
 */
export function calculateCatchProbability(pokemon, pokeballMultiplier) {
  const baseCatchRate = getBaseCatchRate(pokemon);
  const finalRate = baseCatchRate * pokeballMultiplier;
  return Math.min(finalRate, 1.0); // Cap at 100%
}

/**
 * Attempt to catch a Pokemon
 * @param {Object} pokemon - Pokemon data object
 * @param {number} pokeballMultiplier - Pokeball catch rate multiplier
 * @param {boolean} isTutorial - If true, always succeed (for tutorial Pokemon)
 * @returns {boolean} True if catch succeeded, false if failed
 */
export function attemptCatch(pokemon, pokeballMultiplier, isTutorial = false) {
  // Tutorial mode: always succeed
  if (isTutorial) {
    console.log(`Tutorial catch: ${pokemon.name} - GUARANTEED SUCCESS`);
    return true;
  }

  const catchProbability = calculateCatchProbability(pokemon, pokeballMultiplier);
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
