/**
 * Emoji-Word Dictionary for matching games
 * Organized by first letter to enable letter-based filtering
 * Stored in localStorage with key 'emojiWordDictionary'
 */

// Default dictionary - extensive Swedish words with emojis
export const DEFAULT_EMOJI_WORD_DICTIONARY = [
    // A words
    { id: 1, word: "ÄPPLE", emoji: "🍎", letter: "Ä" },
    { id: 2, word: "APA", emoji: "🐵", letter: "A" },
    { id: 3, word: "AUTO", emoji: "🚗", letter: "A" },
    { id: 4, word: "AND", emoji: "🦆", letter: "A" },
    { id: 5, word: "ANANAS", emoji: "🍍", letter: "A" },

    // B words
    { id: 6, word: "BIL", emoji: "🚗", letter: "B" },
    { id: 7, word: "BOLL", emoji: "⚽", letter: "B" },
    { id: 8, word: "BOK", emoji: "📖", letter: "B" },
    { id: 9, word: "BLOMMA", emoji: "🌸", letter: "B" },
    { id: 10, word: "BANAN", emoji: "🍌", letter: "B" },
    { id: 11, word: "BÄR", emoji: "🍓", letter: "B" },
    { id: 12, word: "BRO", emoji: "🌉", letter: "B" },
    { id: 13, word: "BALLONG", emoji: "🎈", letter: "B" },

    // F words
    { id: 14, word: "FISK", emoji: "🐟", letter: "F" },
    { id: 15, word: "FÅGEL", emoji: "🐦", letter: "F" },
    { id: 16, word: "FLAGGA", emoji: "🚩", letter: "F" },
    { id: 17, word: "FLYGPLAN", emoji: "✈️", letter: "F" },
    { id: 18, word: "FOTBOLL", emoji: "⚽", letter: "F" },

    // G words
    { id: 19, word: "GLASS", emoji: "🍦", letter: "G" },
    { id: 20, word: "GRODA", emoji: "🐸", letter: "G" },
    { id: 21, word: "GRIS", emoji: "🐷", letter: "G" },
    { id: 22, word: "GITARR", emoji: "🎸", letter: "G" },

    // H words
    { id: 23, word: "HUND", emoji: "🐶", letter: "H" },
    { id: 24, word: "HUS", emoji: "🏠", letter: "H" },
    { id: 25, word: "HJÄRTA", emoji: "❤️", letter: "H" },
    { id: 26, word: "HÄST", emoji: "🐴", letter: "H" },
    { id: 27, word: "HATT", emoji: "🎩", letter: "H" },

    // K words
    { id: 28, word: "KATT", emoji: "🐱", letter: "K" },
    { id: 29, word: "KLOCKA", emoji: "⏰", letter: "K" },
    { id: 30, word: "KAFFE", emoji: "☕", letter: "K" },
    { id: 31, word: "KAKA", emoji: "🍰", letter: "K" },
    { id: 32, word: "KO", emoji: "🐄", letter: "K" },
    { id: 33, word: "KRONA", emoji: "👑", letter: "K" },

    // L words
    { id: 34, word: "LEJON", emoji: "🦁", letter: "L" },
    { id: 35, word: "LAMPA", emoji: "💡", letter: "L" },
    { id: 36, word: "LEKSAK", emoji: "🧸", letter: "L" },

    // M words
    { id: 37, word: "MÅNE", emoji: "🌙", letter: "M" },
    { id: 38, word: "MUSIK", emoji: "🎵", letter: "M" },
    { id: 39, word: "MUS", emoji: "🐭", letter: "M" },
    { id: 40, word: "MOLN", emoji: "☁️", letter: "M" },

    // P words
    { id: 41, word: "PIZZA", emoji: "🍕", letter: "P" },
    { id: 42, word: "PARAPLY", emoji: "☂️", letter: "P" },
    { id: 43, word: "PRESENT", emoji: "🎁", letter: "P" },

    // R words
    { id: 44, word: "RAKET", emoji: "🚀", letter: "R" },
    { id: 45, word: "REGNBÅGE", emoji: "🌈", letter: "R" },
    { id: 46, word: "ROBOT", emoji: "🤖", letter: "R" },

    // S words
    { id: 47, word: "SOL", emoji: "☀️", letter: "S" },
    { id: 48, word: "STJÄRNA", emoji: "⭐", letter: "S" },
    { id: 49, word: "SNÖGUBBE", emoji: "⛄", letter: "S" },
    { id: 50, word: "SKÖLDPADDA", emoji: "🐢", letter: "S" },

    // T words
    { id: 51, word: "TRÄD", emoji: "🌳", letter: "T" },
    { id: 52, word: "TÅG", emoji: "🚂", letter: "T" },
    { id: 53, word: "TELEFON", emoji: "📱", letter: "T" },

    // Ö words
    { id: 54, word: "ÖGA", emoji: "👁️", letter: "Ö" },
    { id: 55, word: "ÖRA", emoji: "👂", letter: "Ö" }
];

/**
 * Load emoji word dictionary from localStorage or return default
 */
export function getEmojiWordDictionary() {
    const stored = localStorage.getItem('emojiWordDictionary');
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch (e) {
            console.error('Failed to parse emoji word dictionary:', e);
            return [...DEFAULT_EMOJI_WORD_DICTIONARY];
        }
    }
    return [...DEFAULT_EMOJI_WORD_DICTIONARY];
}

/**
 * Save emoji word dictionary to localStorage
 */
export function saveEmojiWordDictionary(dictionary) {
    localStorage.setItem('emojiWordDictionary', JSON.stringify(dictionary));
}

/**
 * Get letter filtering setting
 */
export function getLetterFilterEnabled() {
    const enabled = localStorage.getItem('emojiWordLetterFilter');
    return enabled === 'true';
}

/**
 * Set letter filtering setting
 */
export function setLetterFilterEnabled(enabled) {
    localStorage.setItem('emojiWordLetterFilter', enabled ? 'true' : 'false');
}

/**
 * Get all unique starting letters in dictionary
 */
export function getAvailableLetters() {
    const dictionary = getEmojiWordDictionary();
    const letters = new Set(dictionary.map(item => item.letter));
    return Array.from(letters).sort();
}

/**
 * Get words starting with a specific letter
 */
export function getWordsByLetter(letter) {
    const dictionary = getEmojiWordDictionary();
    return dictionary.filter(item => item.letter === letter);
}

/**
 * Add a new word to the dictionary
 */
export function addEmojiWord(word, emoji, letter) {
    const dictionary = getEmojiWordDictionary();
    const maxId = dictionary.reduce((max, item) => Math.max(max, item.id), 0);
    const newWord = {
        id: maxId + 1,
        word: word.toUpperCase(),
        emoji: emoji,
        letter: letter.toUpperCase()
    };
    dictionary.push(newWord);
    saveEmojiWordDictionary(dictionary);
    return newWord;
}

/**
 * Remove a word from the dictionary
 */
export function removeEmojiWord(id) {
    const dictionary = getEmojiWordDictionary();
    const filtered = dictionary.filter(item => item.id !== id);
    saveEmojiWordDictionary(filtered);
}

/**
 * Reset dictionary to defaults
 */
export function resetEmojiWordDictionary() {
    saveEmojiWordDictionary([...DEFAULT_EMOJI_WORD_DICTIONARY]);
}
