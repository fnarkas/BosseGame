/**
 * Streak Management System
 * Handles streak/multiplier tracking for consecutive successful minigames
 */

const STREAK_KEY = 'streakMultiplier';

/**
 * Get current streak value (0-5)
 * @returns {number} Current streak (0-5)
 */
export function getStreak() {
  const streak = localStorage.getItem(STREAK_KEY);
  return streak ? parseInt(streak, 10) : 0;
}

/**
 * Increment streak by 1 (max 5)
 * @returns {number} New streak value
 */
export function incrementStreak() {
  const current = getStreak();
  const newStreak = Math.min(current + 1, 5); // Max 5
  localStorage.setItem(STREAK_KEY, newStreak.toString());
  return newStreak;
}

/**
 * Reset streak to 0 (called on wrong answer)
 * @returns {number} New streak value (0)
 */
export function resetStreak() {
  localStorage.setItem(STREAK_KEY, '0');
  return 0;
}

/**
 * Get multiplier based on current streak
 * @returns {number} Multiplier (1-5)
 */
export function getMultiplier() {
  const streak = getStreak();
  return Math.max(1, streak); // Minimum 1x multiplier
}
