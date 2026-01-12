/**
 * Swedish alphabet letters for the letter listening game
 * 29 letters: A-Z + Å, Ä, Ö (default)
 * Can be configured via admin panel
 */
const DEFAULT_SWEDISH_LETTERS = [
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
    'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
    'Å', 'Ä', 'Ö'
];

/**
 * Get configured letters from localStorage or use default
 * Supports both uppercase and lowercase letters
 */
export function getConfiguredLetters() {
    try {
        const parsedLetters = localStorage.getItem('letterListeningLettersParsed');
        if (parsedLetters) {
            const letters = JSON.parse(parsedLetters);
            if (Array.isArray(letters) && letters.length > 0) {
                return letters;
            }
        }
    } catch (error) {
        console.warn('Failed to load configured letters, using defaults:', error);
    }
    return DEFAULT_SWEDISH_LETTERS;
}

// Export as constant for backwards compatibility
export const SWEDISH_LETTERS = getConfiguredLetters();
