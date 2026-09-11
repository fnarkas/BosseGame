/**
 * Streak Management System
 * Handles streak/multiplier tracking for consecutive successful minigames.
 *
 * - The streak multiplies the coin reward (x1..x5).
 * - Reaching a milestone (3 and 5 in a row) pays a one-off coin bonus with a
 *   fanfare, so holding a streak feels like it matters (the parent's request).
 * - A streak left overnight expires: coming back to lose a 5-streak on the
 *   first tap of the day is discouraging, so a stale streak restarts at 0.
 */
import { getInt, setInt, remove } from './storage.js';

const STREAK_KEY = 'streakMultiplier';
const STREAK_TIME_KEY = 'streakUpdatedAt';

export const MAX_STREAK = 5;
export const STREAK_EXPIRY_MS = 12 * 60 * 60 * 1000;

// streak value reached -> bonus coins
export const STREAK_MILESTONES = { 3: 5, 5: 15 };

function isExpired(now) {
  const updatedAt = getInt(STREAK_TIME_KEY, 0);
  return updatedAt > 0 && now - updatedAt > STREAK_EXPIRY_MS;
}

/**
 * Get current streak value (0-5). An expired streak reads as 0.
 * @returns {number} Current streak (0-5)
 */
export function getStreak(now = Date.now()) {
  if (isExpired(now)) {
    resetStreak();
    return 0;
  }
  return Math.min(MAX_STREAK, Math.max(0, getInt(STREAK_KEY, 0)));
}

/**
 * Increment streak by 1 (max 5)
 * @returns {number} New streak value
 */
export function incrementStreak(now = Date.now()) {
  const current = getStreak(now);
  const newStreak = Math.min(current + 1, MAX_STREAK);
  setInt(STREAK_KEY, newStreak);
  setInt(STREAK_TIME_KEY, now);
  return newStreak;
}

/**
 * Reset streak to 0 (called on wrong answer)
 * @returns {number} New streak value (0)
 */
export function resetStreak() {
  setInt(STREAK_KEY, 0);
  remove(STREAK_TIME_KEY);
  return 0;
}

/**
 * Set the streak outright (the admin panel), clamped to 0..MAX_STREAK. A
 * value of 0 clears the timestamp like resetStreak().
 * @returns {number} The stored streak
 */
export function setStreak(value, now = Date.now()) {
  const streak = Math.min(MAX_STREAK, Math.max(0, Math.trunc(Number(value)) || 0));
  if (streak === 0) return resetStreak();
  setInt(STREAK_KEY, streak);
  setInt(STREAK_TIME_KEY, now);
  return streak;
}

/**
 * Get multiplier based on current streak
 * @returns {number} Multiplier (1-5)
 */
export function getMultiplier() {
  const streak = getStreak();
  return Math.max(1, streak); // Minimum 1x multiplier
}

/**
 * Bonus coins earned by moving from `previous` to `current`; 0 unless a
 * milestone was crossed on this step (so sitting at max pays no repeat bonus).
 */
export function milestoneBonus(previous, current) {
  if (current <= previous) return 0;
  return STREAK_MILESTONES[current] || 0;
}
