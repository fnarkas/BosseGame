/**
 * Base class for pokeball game modes
 * Defines the interface that all pokeball game modes must implement
 */
export class BasePokeballGameMode {
    constructor() {
        this.answerCallback = null;
        this.challengeData = null;
        this.uiElements = [];
    }

    /**
     * Set the callback function to call when user submits an answer
     * @param {Function} callback - Function that takes (isCorrect: boolean)
     */
    setAnswerCallback(callback) {
        this.answerCallback = callback;
    }

    /**
     * Generate a new challenge
     * @returns {Object} Challenge data specific to this mode
     */
    generateChallenge() {
        throw new Error('generateChallenge must be implemented by subclass');
    }

    /**
     * Create the UI elements for the challenge
     * @param {Phaser.Scene} scene - The Phaser scene
     */
    createChallengeUI(scene) {
        throw new Error('createChallengeUI must be implemented by subclass');
    }

    /**
     * Clean up all UI elements created by this mode
     * @param {Phaser.Scene} scene - The Phaser scene
     */
    cleanup(scene) {
        throw new Error('cleanup must be implemented by subclass');
    }

    /**
     * Check if the answer is correct
     * Called internally by the mode, triggers the answer callback
     * @param {*} answer - The user's answer (type varies by mode)
     * @returns {boolean} True if correct
     */
    checkAnswer(answer) {
        throw new Error('checkAnswer must be implemented by subclass');
    }
}
