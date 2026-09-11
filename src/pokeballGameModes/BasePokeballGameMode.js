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
 *  - `inputLocked` / `isRevealing`: gates modes flip while an answer is being
 *    resolved, so a second tap during the feedback animation is ignored. Use
 *    `isInputBlocked()` in tap handlers.
 *  - Audio: `playAudio()` / `playSequence()` / `stopAudio()` never throw on a
 *    missing key and are stopped by cleanup().
 *  - Feedback: `shakeWrong()`, `revealAnswer()` and `restartChallenge()` are
 *    the standard wrong-answer choreography (red shake, gold pulse on the
 *    right answer while it is spoken aloud, then a fresh challenge).
 *  - Retry queue: `queueRetry()` / `takeRetry()` re-ask a missed item so the
 *    child gets to repair the exact confusion instead of moving on.
 *  - Progress: `createProgressBalls()` / `updateProgressBalls()` and
 *    `createHearts()` / `updateHearts()` are the shared indicators.
 */
import { playAudio as playAudioSafe, stopAudio as stopSound } from '../audio.js';
import { resetStreak } from '../streak.js';
import { updateBoosterBar } from '../boosterBar.js';
import {
    COLORS, TEXT, burstStars, createProgressBalls, createHearts, resetButtonStyle
} from './uiKit.js';

export class BasePokeballGameMode {
    constructor() {
        this.answerCallback = null;
        this.challengeData = null;
        this.uiElements = [];
        this.pendingTimers = new Set();
        this.pendingTweens = new Set();
        this.inputLocked = false;
        this.isRevealing = false;
        this.hasError = false;
        this.activeSounds = [];
        this.audioToken = 0;
        this.retryQueue = [];
        this.progressBalls = null;
        this.hearts = null;
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

    // ------------------------------------------------------------------
    // Input gating
    // ------------------------------------------------------------------

    isInputBlocked() {
        return this.inputLocked || this.isRevealing;
    }

    // ------------------------------------------------------------------
    // Timers and tweens
    // ------------------------------------------------------------------

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

    // ------------------------------------------------------------------
    // Audio
    // ------------------------------------------------------------------

    /**
     * Play an audio key. Missing keys are logged and skipped, never thrown.
     * Stops any audio this mode is already playing unless `overlap` is set.
     * @returns {Phaser.Sound.BaseSound|null}
     */
    playAudio(scene, key, { overlap = false } = {}) {
        if (!overlap) this.stopAudio();
        const sound = playAudioSafe(scene, key);
        if (sound) this.activeSounds.push(sound);
        return sound;
    }

    /**
     * Play several keys back to back with a short gap (stitched speech such as
     * "två hundra" + "fyrtiofem"). Cancelled by stopAudio()/cleanup(), so a
     * later step never plays after the mode has moved on.
     */
    playSequence(scene, keys, { gapMs = 50 } = {}) {
        this.stopAudio();
        const token = this.audioToken;
        const remaining = keys.filter(Boolean);
        const step = () => {
            if (token !== this.audioToken || remaining.length === 0) return;
            const key = remaining.shift();
            const sound = playAudioSafe(scene, key);
            if (sound) this.activeSounds.push(sound);
            if (remaining.length === 0) return;
            const durationMs = sound && Number.isFinite(sound.duration) ? sound.duration * 1000 : 500;
            this.delayedCall(scene, durationMs + gapMs, step);
        };
        step();
    }

    stopAudio() {
        this.audioToken++;
        this.activeSounds.forEach(stopSound);
        this.activeSounds = [];
    }

    // ------------------------------------------------------------------
    // Retry queue (spaced repetition of missed items)
    // ------------------------------------------------------------------

    /**
     * Ask `item` again: immediately (after = 0) or after `after` other items.
     */
    queueRetry(item, after = 0) {
        this.retryQueue.push({ item, after });
    }

    /**
     * The item due for a retry now, or undefined. Advances the queue.
     */
    takeRetry() {
        let due = null;
        for (const entry of this.retryQueue) {
            if (entry.after <= 0 && !due) due = entry;
            else entry.after--;
        }
        if (!due) return undefined;
        this.retryQueue = this.retryQueue.filter(e => e !== due);
        return due.item;
    }

    // ------------------------------------------------------------------
    // Shared UI
    // ------------------------------------------------------------------

    /**
     * The 🔊 replay button. Every mode's speaker looks and feels the same:
     * hover grows it, a tap squashes it briefly, then `onPlay` runs.
     */
    createSpeakerButton(scene, x, y, onPlay, { fontSize = '80px' } = {}) {
        const speaker = scene.add.text(x, y, '🔊', {
            fontSize,
            padding: { y: 20 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        speaker.on('pointerover', () => speaker.setScale(1.1));
        speaker.on('pointerout', () => speaker.setScale(1.0));
        speaker.on('pointerdown', () => {
            speaker.setScale(0.9);
            this.delayedCall(scene, 100, () => { if (speaker.scene) speaker.setScale(1.0); });
            onPlay();
        });
        this.uiElements.push(speaker);
        return speaker;
    }

    /**
     * Row of progress circles ending in a gift. See uiKit.createProgressBalls.
     */
    createProgressBalls(scene, options) {
        this.progressBalls = createProgressBalls(scene, options);
        this.uiElements.push(...this.progressBalls.elements);
        return this.progressBalls;
    }

    updateProgressBalls(completed) {
        if (this.progressBalls) this.progressBalls.update(completed);
    }

    createHearts(scene, options) {
        this.hearts = createHearts(scene, options);
        this.uiElements.push(this.hearts.text);
        return this.hearts;
    }

    updateHearts(remaining) {
        if (this.hearts) this.hearts.update(remaining);
    }

    /**
     * Star burst at (x, y), tracked so cleanup() can remove it mid-burst.
     */
    showSuccessParticles(scene, x, y, options = {}) {
        const particles = burstStars(scene, x, y, options);
        this.uiElements.push(particles);
        this.delayedCall(scene, (options.lifespan || 600) + 100, () => {
            if (particles.scene) particles.destroy();
        });
        return particles;
    }

    // ------------------------------------------------------------------
    // Wrong-answer choreography
    // ------------------------------------------------------------------

    /**
     * Red flash + shake on the thing the child tapped, then restore it and
     * call `onComplete`. Works on rectangles (fill/stroke) and any other game
     * object (shake only).
     */
    shakeWrong(scene, target, { onComplete = null, restore = true, paint = true } = {}) {
        // `target` may be one object or an array (e.g. a box and its label
        // that must shake together). `paint: false` shakes without the red
        // fill/stroke (clock faces, emoji). `restore` is true (base neutral
        // style), false (leave as is) or a function(obj) for custom styling.
        const list = (Array.isArray(target) ? target : [target]).filter(t => t && t.scene);
        if (list.length === 0) { if (onComplete) onComplete(); return; }
        if (paint) {
            list.forEach(t => {
                if (t.setFillStyle) t.setFillStyle(COLORS.WRONG, 0.5);
                if (t.setStrokeStyle) t.setStrokeStyle(6, COLORS.WRONG);
            });
        }
        const originalX = list.map(t => t.x);
        this.addTween(scene, {
            targets: list,
            x: '-=10',
            duration: 50,
            yoyo: true,
            repeat: 3,
            onComplete: () => {
                list.forEach((t, i) => {
                    if (!t.scene) return;
                    t.x = originalX[i];
                    if (typeof restore === 'function') restore(t);
                    else if (restore && paint) resetButtonStyle(t);
                });
                if (onComplete) onComplete();
            }
        });
    }

    /**
     * Show the correct answer: lock input, disable `disable` objects, paint
     * `targets` gold and pulse them for `delay` ms while `audioKey` (the
     * answer, spoken) plays, then call `onDone` (default: restartChallenge).
     */
    revealAnswer(scene, { targets = [], disable = [], audioKey = null, audioKeys = null, delay = 2000, pulseMs = null, restore = false, onDone = null, resetStreak = true } = {}) {
        this.isRevealing = true;
        this.inputLocked = true;
        this.hasError = true;
        disable.forEach(obj => { if (obj && obj.disableInteractive) obj.disableInteractive(); });

        const list = (Array.isArray(targets) ? targets : [targets]).filter(t => t && t.scene);
        list.forEach(t => {
            if (t.setFillStyle) t.setFillStyle(COLORS.REVEAL, 0.5);
            if (t.setStrokeStyle) t.setStrokeStyle(6, COLORS.REVEAL);
        });
        // Pulse for the whole reveal by default (4 x 500 ms yoyo = 2 s);
        // `pulseMs` shortens it for a target that stays in play afterwards.
        const totalPulse = pulseMs || delay;
        const pulses = Math.max(1, Math.round(totalPulse / 500));
        if (list.length > 0) {
            this.addTween(scene, {
                targets: list,
                scaleX: 1.2,
                scaleY: 1.2,
                duration: 250,
                yoyo: true,
                repeat: pulses - 1,
                ease: 'Sine.easeInOut'
            });
            const fillable = list.filter(t => t.setFillStyle);
            if (fillable.length > 0) {
                this.addTween(scene, {
                    targets: fillable,
                    alpha: 0.7,
                    duration: 250,
                    yoyo: true,
                    repeat: pulses - 1,
                    ease: 'Sine.easeInOut'
                });
            }
        }

        // Say the right answer while the child looks at it: this is the moment
        // the sound/symbol link gets repaired.
        if (audioKeys && audioKeys.length) this.playSequence(scene, audioKeys);
        else if (audioKey) this.playAudio(scene, audioKey);

        this.delayedCall(scene, delay, () => {
            if (restore) {
                list.forEach(t => {
                    if (typeof restore === 'function') restore(t);
                    else resetButtonStyle(t);
                });
            }
            if (onDone) onDone();
            else this.restartChallenge(scene, { resetStreak });
        });
    }

    /**
     * Tear down the current challenge and build the next one. Resets the coin
     * streak (and the booster bar) unless told otherwise.
     */
    restartChallenge(scene, { resetStreak: shouldReset = true } = {}) {
        this.cleanup(scene);
        this.hasError = false;
        this.isRevealing = false;
        if (shouldReset) {
            resetStreak();
            if (scene.boosterBarElements) updateBoosterBar(scene.boosterBarElements, 0, scene);
        }
        this.generateChallenge();
        this.createChallengeUI(scene);
    }

    // ------------------------------------------------------------------
    // Teardown
    // ------------------------------------------------------------------

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
        this.progressBalls = null;
        this.hearts = null;
    }

    /**
     * Clean up all UI elements, timers, tweens and audio created by this mode.
     * Subclasses that override this must call super.cleanup(scene).
     * @param {Phaser.Scene} scene - The Phaser scene
     */
    cleanup(scene) {
        this.clearPending();
        this.stopAudio();
        this.destroyUI();
        this.inputLocked = false;
        this.isRevealing = false;
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

export { COLORS, TEXT };
