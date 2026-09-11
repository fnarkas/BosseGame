import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { COLORS } from './uiKit.js';
import { trackWrongAnswer } from '../wrongAnswers.js';
import { loadModeConfig } from '../minigameConfig.js';
import { clockAudioKey } from '../audio.js';

/**
 * Clock Listening Mode - Listen to Swedish time and set clock hands
 * User hears "Klockan tre" or "Klockan halv fem" and drags the hands to match.
 * A miss shakes the clock, swings the hands to the right time in gold while
 * the time is spoken again, and then asks the same time once more.
 */

const DEFAULT_CONFIG = { required: 3, includeHalfHours: true };

const SPEAKER_Y = 150;
const CLOCK_Y = 360;
const CLOCK_RADIUS = 140;
const SUBMIT_Y = 580;
const BALLS_Y = 680;
const HOUR_HAND_COLOR = 0x2C3E50;
const MINUTE_HAND_COLOR = 0xE74C3C;

export { clockAudioKey };

export class ClockListeningMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.correctInRow = 0;

        // Default values (overridden by loadConfig)
        this.requiredCorrect = DEFAULT_CONFIG.required;
        this.includeHalfHours = DEFAULT_CONFIG.includeHalfHours;

        this.currentHour = null;
        this.currentMinute = null;
        // The time the player has currently dialled in on the clock. The hour
        // hand is always drawn from these so it drifts with the minute hand
        // (e.g. at 5:30 the hour hand sits halfway between 5 and 6).
        this.setHour = 12;
        this.setMinute = 0;
        this.hourHand = null;
        this.minuteHand = null;
        this.hourHitbox = null;
        this.minuteHitbox = null;
        this.clockParts = [];       // Everything centred on the clock (for the shake)
        this.clockCenter = { x: 0, y: 0 };
        this.configLoaded = false;
    }

    async loadConfig() {
        const config = await loadModeConfig('clockListening', DEFAULT_CONFIG);
        this.requiredCorrect = config.required || DEFAULT_CONFIG.required;
        this.includeHalfHours = config.includeHalfHours !== false;
        this.configLoaded = true;
    }

    generateChallenge() {
        // A missed time comes back first
        const retry = this.takeRetry();
        if (retry) {
            this.currentHour = retry.hour;
            this.currentMinute = retry.minute;
        } else {
            const previousHour = this.currentHour;
            const previousMinute = this.currentMinute;
            // Random whole or half hour, avoiding the same time twice in a row
            for (let attempt = 0; attempt < 20; attempt++) {
                this.currentHour = Math.floor(Math.random() * 12) + 1; // 1-12
                this.currentMinute = (this.includeHalfHours && Math.random() < 0.5) ? 30 : 0;
                if (this.currentHour !== previousHour || this.currentMinute !== previousMinute) break;
            }
        }

        this.challengeData = { hour: this.currentHour, minute: this.currentMinute };
        return this.challengeData;
    }

    createChallengeUI(scene) {
        const width = scene.cameras.main.width;

        // A new question is answerable again
        this.inputLocked = false;
        this.isRevealing = false;

        this.createSpeakerButton(scene, width / 2, SPEAKER_Y, () => this.playClockAudio(scene));
        this.playClockAudio(scene);

        this.clockCenter = { x: width / 2, y: CLOCK_Y };
        this.createClock(scene);
        this.createProgressBalls(scene, { total: this.requiredCorrect, completed: this.correctInRow, y: BALLS_Y });
        this.createSubmitButton(scene);
    }

    createClock(scene) {
        const { x, y } = this.clockCenter;
        this.clockParts = [];

        const clockBg = scene.add.circle(x, y, CLOCK_RADIUS, COLORS.NEUTRAL_FILL, 1);
        clockBg.setStrokeStyle(6, COLORS.OUTLINE);
        this.uiElements.push(clockBg);
        this.clockParts.push(clockBg);

        // Hour markers (the numbers are learning content)
        for (let i = 1; i <= 12; i++) {
            const angle = (i * 30 - 90) * Math.PI / 180; // -90 so 12 is at the top
            const markerRadius = CLOCK_RADIUS - 20;
            const marker = scene.add.text(x + Math.cos(angle) * markerRadius, y + Math.sin(angle) * markerRadius, i.toString(), {
                fontSize: '24px',
                fontFamily: 'Arial',
                color: '#000000',
                fontStyle: 'bold'
            }).setOrigin(0.5);
            this.uiElements.push(marker);
        }

        // Hands pivot at the bottom (the clock centre)
        const hourHandLength = 60;
        this.hourHand = scene.add.rectangle(x, y, 8, hourHandLength, HOUR_HAND_COLOR, 1);
        this.hourHand.setOrigin(0.5, 1);
        this.uiElements.push(this.hourHand);

        const minuteHandLength = 100;
        this.minuteHand = scene.add.rectangle(x, y, 5, minuteHandLength, MINUTE_HAND_COLOR, 1);
        this.minuteHand.setOrigin(0.5, 1);
        this.uiElements.push(this.minuteHand);

        // Larger invisible hitboxes for easier dragging
        this.hourHitbox = scene.add.rectangle(x, y, 40, hourHandLength + 20, COLORS.NEUTRAL_FILL, 0);
        this.hourHitbox.setOrigin(0.5, 1);
        this.hourHitbox.setInteractive({ useHandCursor: true, draggable: true });
        this.hourHitbox.setData('handType', 'hour');
        this.uiElements.push(this.hourHitbox);

        this.minuteHitbox = scene.add.rectangle(x, y, 30, minuteHandLength + 20, COLORS.NEUTRAL_FILL, 0);
        this.minuteHitbox.setOrigin(0.5, 1);
        this.minuteHitbox.setInteractive({ useHandCursor: true, draggable: true });
        this.minuteHitbox.setData('handType', 'minute');
        this.uiElements.push(this.minuteHitbox);

        // Centre dot on top of the hands
        const centerDot = scene.add.circle(x, y, 8, COLORS.OUTLINE, 1);
        this.uiElements.push(centerDot);

        this.clockParts.push(this.hourHand, this.minuteHand, this.hourHitbox, this.minuteHitbox, centerDot);

        // Hands start at 12:00
        this.setHour = 12;
        this.setMinute = 0;
        this.updateHandVisuals();

        this.setupHandDragging(this.hourHitbox);
        this.setupHandDragging(this.minuteHitbox);
    }

    // Draw both hands from the dialled-in time. The hour hand includes the
    // minute fraction so it moves gradually as the minute hand is set.
    updateHandVisuals() {
        const minuteAngle = this.setMinute * 6;                       // 6° per minute
        const hourAngle = (this.setHour % 12) * 30 + (this.setMinute / 60) * 30;
        if (this.hourHand) this.hourHand.angle = hourAngle;
        if (this.hourHitbox) this.hourHitbox.angle = hourAngle;
        if (this.minuteHand) this.minuteHand.angle = minuteAngle;
        if (this.minuteHitbox) this.minuteHitbox.angle = minuteAngle;
    }

    setupHandDragging(hitbox) {
        hitbox.on('drag', (pointer) => {
            // Hands are frozen while an answer is being resolved / revealed
            if (this.isInputBlocked()) return;

            // Angle from the clock centre to the pointer, 0° at 12 o'clock
            const dx = pointer.x - this.clockCenter.x;
            const dy = pointer.y - this.clockCenter.y;
            let angle = Math.atan2(dy, dx) * 180 / Math.PI + 90;
            angle = ((angle % 360) + 360) % 360;

            if (hitbox.getData('handType') === 'hour') {
                // Pick the whole hour, subtracting the minute-hand offset the
                // hour hand currently carries so the choice isn't skewed by it.
                const minuteOffset = (this.setMinute / 60) * 30;
                let hour = Math.round((angle - minuteOffset) / 30);
                hour = ((hour % 12) + 12) % 12;
                this.setHour = hour === 0 ? 12 : hour;
            } else {
                // Snap the minute hand to 5-minute increments (each 5 min = 30°)
                const minute = Math.round(angle / 30) * 5;
                this.setMinute = ((minute % 60) + 60) % 60;
            }

            // Redraw both hands so the hour hand follows the minute hand
            this.updateHandVisuals();
        });
    }

    createSubmitButton(scene) {
        const width = scene.cameras.main.width;

        const submitBtn = scene.add.rectangle(width / 2, SUBMIT_Y, 200, 70, COLORS.CORRECT, 1);
        submitBtn.setStrokeStyle(4, COLORS.NEUTRAL_FILL);
        submitBtn.setInteractive({ useHandCursor: true });
        this.uiElements.push(submitBtn);

        const submitText = scene.add.text(width / 2, SUBMIT_Y, '✓', {
            fontSize: '48px',
            fontFamily: 'Arial',
            color: '#FFFFFF'
        }).setOrigin(0.5);
        this.uiElements.push(submitText);

        submitBtn.on('pointerdown', () => {
            if (this.isInputBlocked()) return;
            this.inputLocked = true;
            this.checkAnswer(scene);
        });
    }

    checkAnswer(scene) {
        // The dialled-in time is tracked directly as state (the hour hand's
        // visual offset from the minute hand is already baked into setHour).
        const playerHour = this.setHour;
        const playerMinute = this.setMinute;
        const isCorrect = playerHour === this.currentHour && playerMinute === this.currentMinute;

        if (isCorrect) {
            this.showCorrectFeedback(scene);
            this.correctInRow++;
            this.updateProgressBalls(this.correctInRow);

            if (this.correctInRow >= this.requiredCorrect) {
                this.delayedCall(scene, 1000, () => {
                    this.finish(true, 'clock-listening', scene.cameras.main.width / 2, scene.cameras.main.height / 2);
                });
            } else {
                this.delayedCall(scene, 1000, () => this.restartChallenge(scene, { resetStreak: false }));
            }
        } else {
            trackWrongAnswer(
                'ClockListeningMode',
                `${this.currentHour}:${this.currentMinute.toString().padStart(2, '0')}`,
                `${playerHour}:${playerMinute.toString().padStart(2, '0')}`
            );

            this.correctInRow = 0;
            this.updateProgressBalls(0);

            // Same time straight away, and once more a couple of rounds later
            const time = { hour: this.currentHour, minute: this.currentMinute };
            this.queueRetry(time);
            this.queueRetry({ ...time }, 2);

            this.showWrongFeedback(scene);
        }
    }

    showCorrectFeedback(scene) {
        const greenFlash = scene.add.circle(this.clockCenter.x, this.clockCenter.y, 150, COLORS.CORRECT, 0.3);
        this.uiElements.push(greenFlash);
        this.showSuccessParticles(scene, this.clockCenter.x, this.clockCenter.y);
    }

    // Red flash + shake on the clock while the time is spoken again; after the
    // shake the hands swing to the right time in gold. Then the same time
    // again on a fresh clock (streak reset).
    showWrongFeedback(scene) {
        const redFlash = scene.add.circle(this.clockCenter.x, this.clockCenter.y, 150, COLORS.WRONG, 0.3);
        this.uiElements.push(redFlash);

        const targets = [...this.clockParts, redFlash];
        const originalX = this.clockCenter.x;
        this.addTween(scene, {
            targets,
            x: originalX - 10,
            duration: 50,
            yoyo: true,
            repeat: 3,
            onComplete: () => {
                targets.forEach(el => { if (el.scene) el.x = originalX; });
                this.showCorrectAnswer(scene);
            }
        });

        this.revealAnswer(scene, { audioKey: clockAudioKey(this.currentHour, this.currentMinute) });
    }

    showCorrectAnswer(scene) {
        // The hour hand sits between two numbers at half past
        const correctHourAngle = (this.currentHour % 12) * 30 + (this.currentMinute / 60) * 30;
        const correctMinuteAngle = this.currentMinute * 6;

        this.addTween(scene, {
            targets: [this.hourHand, this.hourHitbox],
            angle: correctHourAngle,
            duration: 800,
            ease: 'Back.easeOut'
        });
        this.addTween(scene, {
            targets: [this.minuteHand, this.minuteHitbox],
            angle: correctMinuteAngle,
            duration: 800,
            ease: 'Back.easeOut'
        });

        this.hourHand.setFillStyle(COLORS.REVEAL);
        this.minuteHand.setFillStyle(COLORS.REVEAL);
    }

    playClockAudio(scene) {
        this.playAudio(scene, clockAudioKey(this.currentHour, this.currentMinute));
    }

    cleanup(scene) {
        // Destroys all UI elements, cancels pending timers/tweens, stops audio, unlocks input
        super.cleanup(scene);
        this.hourHand = null;
        this.minuteHand = null;
        this.hourHitbox = null;
        this.minuteHitbox = null;
        this.clockParts = [];
    }
}
