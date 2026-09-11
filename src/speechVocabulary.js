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

/**
 * Swedish sentences for speech recognition reading game
 * Organized by difficulty level
 */
export const SPEECH_SENTENCES = {
    // Easy: short sentences, simple words, basic spelling
    easy: [
        { sentence: 'bollen är stor', translation: 'the ball is big' },
        { sentence: 'katten är söt', translation: 'the cat is cute' },
        { sentence: 'hunden är brun', translation: 'the dog is brown' },
        { sentence: 'solen är varm', translation: 'the sun is warm' },
        { sentence: 'boken är blå', translation: 'the book is blue' },
        { sentence: 'bilen är röd', translation: 'the car is red' },
        { sentence: 'huset är vitt', translation: 'the house is white' },
        { sentence: 'mamma är här', translation: 'mom is here' },
    ],

    // Medium: slightly longer, still common words
    medium: [
        { sentence: 'jag ser en katt', translation: 'I see a cat' },
        { sentence: 'det är en hund', translation: 'it is a dog' },
        { sentence: 'bollen är gul och stor', translation: 'the ball is yellow and big' },
        { sentence: 'pappa har en bil', translation: 'dad has a car' },
        { sentence: 'titta på solen', translation: 'look at the sun' },
    ],

    // Hard: longer sentences, more complex
    hard: [
        { sentence: 'katten sover i sängen', translation: 'the cat sleeps in the bed' },
        { sentence: 'hunden leker med bollen', translation: 'the dog plays with the ball' },
        { sentence: 'jag har en röd bok', translation: 'I have a red book' },
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

// Get all sentences as flat array
export function getAllSentences() {
    return [
        ...SPEECH_SENTENCES.easy,
        ...SPEECH_SENTENCES.medium,
        ...SPEECH_SENTENCES.hard
    ];
}

// Get random sentence from specific difficulty
export function getRandomSentence(difficulty = 'easy') {
    const sentences = SPEECH_SENTENCES[difficulty] || SPEECH_SENTENCES.easy;
    return sentences[Math.floor(Math.random() * sentences.length)];
}

// Get random sentence from any difficulty
export function getRandomAnySentence() {
    const allSentences = getAllSentences();
    return allSentences[Math.floor(Math.random() * allSentences.length)];
}
