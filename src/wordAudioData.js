/**
 * Word Audio Data
 * Maps Swedish words to their audio file keys
 */

import { getAllWords } from './speechVocabulary.js';

/**
 * Get audio key for a word
 * @param {string} word - The word
 * @returns {string} Audio key (e.g., 'word_audio_sol')
 */
export function getWordAudioKey(word) {
    return `word_audio_${word.toLowerCase()}`;
}

/**
 * Get all word audio mappings
 * @returns {Array} Array of { word, audioKey, filename }
 */
export function getAllWordAudioMappings() {
    const words = getAllWords();
    return words.map(wordObj => ({
        word: wordObj.word,
        audioKey: getWordAudioKey(wordObj.word),
        filename: `${wordObj.word}.mp3`
    }));
}

/**
 * Play word audio
 * @param {Phaser.Scene} scene - The Phaser scene
 * @param {string} word - The word to play
 */
export function playWordAudio(scene, word) {
    const audioKey = getWordAudioKey(word);
    // Check if audio exists in cache
    if (scene.cache.audio.exists(audioKey)) {
        scene.sound.play(audioKey);
    } else {
        console.warn(`Word audio not found: ${word}, key: ${audioKey}`);
    }
}

/**
 * Play a sentence by stitching word audio together
 * @param {Phaser.Scene} scene - The Phaser scene
 * @param {string} sentence - The sentence to play (space-separated words)
 * @param {number} gapMs - Gap between words in milliseconds (default 50ms)
 */
export function playSentenceAudio(scene, sentence, gapMs = 50) {
    const words = sentence.toLowerCase().split(' ').filter(w => w.length > 0);

    if (words.length === 0) return;

    let cumulativeDelay = 0;

    words.forEach((word, index) => {
        const audioKey = getWordAudioKey(word);

        if (!scene.cache.audio.exists(audioKey)) {
            console.warn(`Sentence word audio not found: ${word}, key: ${audioKey}`);
            return;
        }

        // Get audio duration for timing the next word
        const sound = scene.sound.get(audioKey) || scene.sound.add(audioKey);
        const duration = sound.duration * 1000; // Convert to ms

        // Schedule this word
        scene.time.delayedCall(cumulativeDelay, () => {
            scene.sound.play(audioKey);
        });

        // Add this word's duration + gap for next word
        cumulativeDelay += duration + gapMs;
    });
}
