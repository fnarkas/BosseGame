/**
 * Base class for answer modes
 * Defines the interface that all answer modes must implement
 */
export class BaseAnswerMode {
    constructor() {
        this.answerCallback = null;
        this.challengeData = null;
    }

    /**
     * Set the callback function to call when user submits an answer
     * @param {Function} callback - Function that takes (isCorrect: boolean)
     */
    setAnswerCallback(callback) {
        this.answerCallback = callback;
    }

    /**
     * Generate a new challenge based on the current Pokemon
     * @param {Object} pokemon - The Pokemon object {id, name}
     * @returns {Object} Challenge data specific to this mode
     */
    generateChallenge(pokemon) {
        throw new Error('generateChallenge must be implemented by subclass');
    }

    /**
     * Create the UI elements for the challenge
     * @param {Phaser.Scene} scene - The Phaser scene
     * @param {number} attemptsLeft - Number of attempts remaining
     */
    createChallengeUI(scene, attemptsLeft) {
        throw new Error('createChallengeUI must be implemented by subclass');
    }

    /**
     * Update the UI after a wrong answer (if attempts remain)
     * @param {Phaser.Scene} scene - The Phaser scene
     * @param {number} attemptsLeft - Number of attempts remaining
     * @param {Object} usedData - Data about previous attempts (mode-specific)
     */
    updateUI(scene, attemptsLeft, usedData) {
        throw new Error('updateUI must be implemented by subclass');
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
