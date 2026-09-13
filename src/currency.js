import { getInt, setInt } from './storage.js';
import { clampCount } from './inventory.js';

/**
 * Currency Management System
 * Handles coin storage and operations
 */

export const COIN_KEY = 'coinCount';

/**
 * Get current coin count
 * @returns {number} Current coin count
 */
export function getCoinCount() {
  return Math.max(0, getInt(COIN_KEY, 0));
}

/**
 * Add coins to the player's balance
 * @param {number} amount - Amount of coins to add
 * @returns {number} New coin count
 */
export function addCoins(amount) {
  const current = getCoinCount();
  const newAmount = current + amount;
  setInt(COIN_KEY, newAmount);
  return newAmount;
}

/**
 * Set the balance outright (the admin panel). Negative or invalid input
 * becomes 0.
 * @param {number} amount - New coin count
 * @returns {number} The stored coin count
 */
export function setCoinCount(amount) {
  const value = clampCount(amount);
  setInt(COIN_KEY, value);
  return value;
}

/**
 * Deduct coins from the player's balance
 * @param {number} amount - Amount of coins to deduct
 * @returns {number|null} New coin count, or null if insufficient coins
 */
export function deductCoins(amount) {
  const current = getCoinCount();
  if (current < amount) {
    return null; // Insufficient coins
  }
  const newAmount = current - amount;
  setInt(COIN_KEY, newAmount);
  return newAmount;
}

/**
 * Generate random coin reward (1-3 coins)
 * @returns {number} Random amount between 1 and 3
 */
export function getRandomCoinReward() {
  return Math.floor(Math.random() * 3) + 1; // 1, 2, or 3
}
