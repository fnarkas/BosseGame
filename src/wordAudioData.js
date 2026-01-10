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
