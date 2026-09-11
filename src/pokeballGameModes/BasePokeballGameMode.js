/**
 * Base class for pokeball game modes
 * Defines the interface that all pokeball game modes must implement, plus the
 * shared plumbing every mode needs:
 *
 *  - `uiElements`: every game object the mode creates goes here so cleanup()
 *    can destroy it.
 *  - `delayedCall()` / `addTween()`: wrappers around scene.time.delayedCall
 *    and scene.tweens.add that remember what they created. cleanup() removes
 *    all of them, so a timer or tween scheduled by an old challenge can never
 *    fire after the mode has moved on (or after the scene has switched to a
 *    different mode) and rebuild UI on top of the new one.
 *  - `inputLocked`: a simple gate modes flip while an answer is being
 *    resolved, so a second tap during the feedback animation is ignored.
 */
export class BasePokeballGameMode {
    constructor() {
        this.answerCallback = null;
        this.challengeData = null;
        this.uiElements = [];
        this.pendingTimers = new Set();
        this.pendingTweens = new Set();
        this.inputLocked = false;
    }

    /**
     * Set the callback function to call when user submits an answer
     * @param {Function} callback - Function that takes (isCorrect: boolean, answer, x, y)
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
     * Check if the answer is correct
     * Called internally by the mode, triggers the answer callback
     * @param {*} answer - The user's answer (type varies by mode)
     * @returns {boolean} True if correct
     */
    checkAnswer(answer) {
        throw new Error('checkAnswer must be implemented by subclass');
    }

    /**
     * Schedule a callback that is cancelled automatically by cleanup().
     * @returns {Phaser.Time.TimerEvent}
     */
    delayedCall(scene, delay, callback) {
        const event = scene.time.delayedCall(delay, () => {
            this.pendingTimers.delete(event);
            callback();
        });
        this.pendingTimers.add(event);
        return event;
    }

    /**
     * Add a tween that is stopped automatically by cleanup(). Its onComplete
     * never fires after cleanup, so feedback animations can't resurrect a
     * challenge that has already been torn down.
     * @returns {Phaser.Tweens.Tween}
     */
    addTween(scene, config) {
        const userComplete = config.onComplete;
        let tween;
        tween = scene.tweens.add({
            ...config,
            onComplete: (...args) => {
                this.pendingTweens.delete(tween);
                if (userComplete) userComplete(...args);
            }
        });
        this.pendingTweens.add(tween);
        return tween;
    }

    /**
     * Cancel every pending timer and tween created through the helpers above.
     */
    clearPending() {
        this.pendingTimers.forEach(event => {
            if (event && event.remove) event.remove(false);
        });
        this.pendingTimers.clear();
        this.pendingTweens.forEach(tween => {
            if (tween && tween.stop) tween.stop();
        });
        this.pendingTweens.clear();
    }

    /**
     * Destroy everything in uiElements.
     */
    destroyUI() {
        this.uiElements.forEach(element => {
            if (element && element.destroy) {
                element.destroy();
            }
        });
        this.uiElements = [];
    }

    /**
     * Clean up all UI elements, timers and tweens created by this mode.
     * Subclasses that override this must call super.cleanup(scene).
     * @param {Phaser.Scene} scene - The Phaser scene
     */
    cleanup(scene) {
        this.clearPending();
        this.destroyUI();
        this.inputLocked = false;
    }

    /**
     * Report the final answer to the scene. Guarded so a mode can never
     * trigger the reward twice (e.g. a timer and a tap racing each other).
     */
    finish(isCorrect, answer, x, y) {
        if (this.answerSent) return;
        this.answerSent = true;
        if (this.answerCallback) {
            this.answerCallback(isCorrect, answer, x, y);
        }
    }
}
