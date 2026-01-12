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
 * Parse letter range string (e.g., "a-z,B,C" -> ['a','b',...,'z','B','C'])
 */
function parseLetterRange(input) {
    try {
        const parts = input.split(',');
        const letters = [];

        for (const part of parts) {
            const trimmed = part.trim();
            if (trimmed.includes('-')) {
                // Handle range like "a-z" or "A-Z"
                const [start, end] = trimmed.split('-').map(s => s.trim());
                if (start.length !== 1 || end.length !== 1) {
                    return null; // Invalid
                }
                const startCode = start.charCodeAt(0);
                const endCode = end.charCodeAt(0);

                if (startCode > endCode) {
                    return null; // Invalid range
                }

                for (let i = startCode; i <= endCode; i++) {
                    letters.push(String.fromCharCode(i));
                }
            } else if (trimmed.length === 1) {
                // Single letter
                letters.push(trimmed);
            } else if (trimmed.length > 1) {
                return null; // Invalid
            }
        }

        // Remove duplicates while preserving order
        return Array.from(new Set(letters));
    } catch (error) {
        return null;
    }
}

// Cache for server config to avoid multiple fetches
let configCache = null;
let configCacheTime = 0;
const CACHE_DURATION = 60000; // 1 minute

/**
 * Get configured letters from server config or use default
 * Supports both uppercase and lowercase letters
 */
export async function getConfiguredLetters() {
    try {
        // Check cache first
        const now = Date.now();
        if (configCache && (now - configCacheTime) < CACHE_DURATION) {
            console.log('Using cached letter config');
            return configCache;
        }

        // Fetch server config
        const response = await fetch('/config/minigames.json');
        if (response.ok) {
            const config = await response.json();
            if (config.letters?.letters) {
                const parsedLetters = parseLetterRange(config.letters.letters);
                if (parsedLetters && parsedLetters.length > 0) {
                    console.log('Loaded configured letters from server:', parsedLetters);
                    configCache = parsedLetters;
                    configCacheTime = now;
                    return parsedLetters;
                }
            }
        }
    } catch (error) {
        console.warn('Failed to load configured letters from server, using defaults:', error);
    }

    console.log('Using default letters:', DEFAULT_SWEDISH_LETTERS);
    configCache = DEFAULT_SWEDISH_LETTERS;
    configCacheTime = Date.now();
    return DEFAULT_SWEDISH_LETTERS;
}

// For synchronous access, return default and update asynchronously
export const SWEDISH_LETTERS = DEFAULT_SWEDISH_LETTERS;
