/**
 * Wrong Answer Tracking System
 * Tracks common mistakes to help identify learning patterns
 */

const WRONG_ANSWERS_KEY = 'wrongAnswers';

/**
 * Get the current wrong answers data
 * @returns {Object} Wrong answers tracking data
 */
export function getWrongAnswersData() {
  const data = localStorage.getItem(WRONG_ANSWERS_KEY);
  if (data) {
    return JSON.parse(data);
  }

  // Return default structure
  return {
    mistakeCounts: {
      LetterListeningMode: {},
      WordEmojiMatchMode: {},
      LeftRightMode: {},
      LetterDragMatchMode: {}
    },
    lastUpdated: new Date().toISOString(),
    totalMistakes: 0
  };
}

/**
 * Save wrong answers data to localStorage
 * @param {Object} data - Wrong answers data to save
 */
function saveWrongAnswersData(data) {
  data.lastUpdated = new Date().toISOString();
  localStorage.setItem(WRONG_ANSWERS_KEY, JSON.stringify(data));
}

/**
 * Track a wrong answer
 * @param {string} gameMode - Game mode name (e.g., 'LetterListeningMode')
 * @param {string} correctAnswer - The correct answer
 * @param {string} wrongAnswer - What the player chose
 * @param {Object} challengeData - Optional challenge context
 */
export function trackWrongAnswer(gameMode, correctAnswer, wrongAnswer, challengeData = {}) {
  const data = getWrongAnswersData();

  // Ensure game mode exists in data
  if (!data.mistakeCounts[gameMode]) {
    data.mistakeCounts[gameMode] = {};
  }

  // Create mistake key based on game mode
  let mistakeKey;

  switch(gameMode) {
    case 'LetterListeningMode':
    case 'LetterDragMatchMode':
      // Track letter confusion: "a_confused_with_ä"
      mistakeKey = `${correctAnswer}_confused_with_${wrongAnswer}`;
      break;

    case 'WordEmojiMatchMode':
      // Track word-emoji mistakes: "word_hund_wrong_emoji_🐱"
      mistakeKey = `word_${challengeData.word || 'unknown'}_wrong_emoji_${wrongAnswer}`;
      break;

    case 'LeftRightMode':
      // Track direction mistakes: "vanster_wrong" or "hoger_wrong"
      mistakeKey = `${correctAnswer}_wrong`;
      break;

    default:
      mistakeKey = `${correctAnswer}_vs_${wrongAnswer}`;
  }

  // Increment count for this mistake
  if (!data.mistakeCounts[gameMode][mistakeKey]) {
    data.mistakeCounts[gameMode][mistakeKey] = 0;
  }
  data.mistakeCounts[gameMode][mistakeKey]++;

  // Increment total
  data.totalMistakes++;

  // Save
  saveWrongAnswersData(data);

  console.log(`Tracked mistake: ${gameMode} - ${mistakeKey} (count: ${data.mistakeCounts[gameMode][mistakeKey]})`);
}

/**
 * Get mistake count for a specific error
 * @param {string} gameMode - Game mode name
 * @param {string} mistakeKey - The mistake key
 * @returns {number} Count of this mistake
 */
export function getMistakeCount(gameMode, mistakeKey) {
  const data = getWrongAnswersData();
  return data.mistakeCounts[gameMode]?.[mistakeKey] || 0;
}

/**
 * Get all mistakes for a game mode
 * @param {string} gameMode - Game mode name
 * @returns {Object} All mistakes for this mode with counts
 */
export function getGameModeMistakes(gameMode) {
  const data = getWrongAnswersData();
  return data.mistakeCounts[gameMode] || {};
}

/**
 * Get most common mistakes across all modes
 * @param {number} limit - Max number of mistakes to return
 * @returns {Array} Array of {gameMode, mistake, count} sorted by count
 */
export function getMostCommonMistakes(limit = 10) {
  const data = getWrongAnswersData();
  const allMistakes = [];

  // Flatten all mistakes
  Object.keys(data.mistakeCounts).forEach(gameMode => {
    Object.keys(data.mistakeCounts[gameMode]).forEach(mistake => {
      allMistakes.push({
        gameMode,
        mistake,
        count: data.mistakeCounts[gameMode][mistake]
      });
    });
  });

  // Sort by count descending
  allMistakes.sort((a, b) => b.count - a.count);

  // Return top N
  return allMistakes.slice(0, limit);
}

/**
 * Reset all mistake tracking
 */
export function resetMistakeTracking() {
  localStorage.removeItem(WRONG_ANSWERS_KEY);
  console.log('All mistake tracking has been reset');
}

/**
 * Get total number of mistakes tracked
 * @returns {number} Total mistakes
 */
export function getTotalMistakes() {
  const data = getWrongAnswersData();
  return data.totalMistakes || 0;
}
