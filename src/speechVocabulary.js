/**
 * Swedish vocabulary words for speech recognition reading game
 * Organized by difficulty level
 */

export const SPEECH_VOCABULARY = {
    // Easy: 3-4 letters, simple phonetics (NO sj, ch, tj, mj, fj sounds!)
    easy: [
        { word: 'sol', translation: 'sun' },
        { word: 'katt', translation: 'cat' },
        { word: 'hund', translation: 'dog' },
        { word: 'bok', translation: 'book' },
        { word: 'boll', translation: 'ball' },
        { word: 'hus', translation: 'house' },
        { word: 'bil', translation: 'car' },
        { word: 'båt', translation: 'boat' },
        { word: 'öga', translation: 'eye' },
        { word: 'arm', translation: 'arm' },
        { word: 'ben', translation: 'leg' },
        { word: 'bi', translation: 'bee' },
        { word: 'ost', translation: 'cheese' },
        { word: 'ko', translation: 'cow' },
        { word: 'mus', translation: 'mouse' },
    ],

    // Medium: 5-6 letters (simple sounds only)
    medium: [
        { word: 'äpple', translation: 'apple' },
        { word: 'blomma', translation: 'flower' },
        { word: 'träd', translation: 'tree' },
        { word: 'fågel', translation: 'bird' },
        { word: 'vatten', translation: 'water' },
        { word: 'penna', translation: 'pen' },
        { word: 'lejon', translation: 'lion' },
        { word: 'bröd', translation: 'bread' },
        { word: 'glass', translation: 'ice cream' },
        { word: 'måne', translation: 'moon' },
    ],

    // Hard: 7+ letters, complex words (avoiding difficult sounds)
    hard: [
        { word: 'elefant', translation: 'elephant' },
        { word: 'giraff', translation: 'giraffe' },
        { word: 'present', translation: 'gift' },
        { word: 'drake', translation: 'dragon' },
        { word: 'regnbåge', translation: 'rainbow' },
        { word: 'kanin', translation: 'rabbit' },
        { word: 'tiger', translation: 'tiger' },
        { word: 'tomat', translation: 'tomato' },
    ]
};

// Get all words as flat array
export function getAllWords() {
    return [
        ...SPEECH_VOCABULARY.easy,
        ...SPEECH_VOCABULARY.medium,
        ...SPEECH_VOCABULARY.hard
    ];
}

// Get random word from specific difficulty
export function getRandomWord(difficulty = 'easy') {
    const words = SPEECH_VOCABULARY[difficulty] || SPEECH_VOCABULARY.easy;
    return words[Math.floor(Math.random() * words.length)];
}

// Get random word from any difficulty
export function getRandomAnyWord() {
    const allWords = getAllWords();
    return allWords[Math.floor(Math.random() * allWords.length)];
}
