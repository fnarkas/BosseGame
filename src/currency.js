/**
 * Currency Management System
 * Handles coin storage and operations
 */

const COIN_KEY = 'coinCount';

/**
 * Get current coin count
 * @returns {number} Current coin count
 */
export function getCoinCount() {
  const coins = localStorage.getItem(COIN_KEY);
  return coins ? parseInt(coins, 10) : 0;
}

/**
 * Add coins to the player's balance
 * @param {number} amount - Amount of coins to add
 * @returns {number} New coin count
 */
export function addCoins(amount) {
  const current = getCoinCount();
  const newAmount = current + amount;
  localStorage.setItem(COIN_KEY, newAmount.toString());
  return newAmount;
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
  localStorage.setItem(COIN_KEY, newAmount.toString());
  return newAmount;
}

/**
 * Generate random coin reward (1-3 coins)
 * @returns {number} Random amount between 1 and 3
 */
export function getRandomCoinReward() {
  return Math.floor(Math.random() * 3) + 1; // 1, 2, or 3
}
