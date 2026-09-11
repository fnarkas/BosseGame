import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { COLORS } from './uiKit.js';
import { trackWrongAnswer } from '../wrongAnswers.js';
import { SpeechRecognitionHelper } from '../utils/speechRecognitionHelper.js';
import { createMicButton } from '../components/MicButton.js';
import { loadModeConfig } from '../minigameConfig.js';
import { clockAudioKey } from './ClockListeningMode.js';

/**
 * Clock Reading Mode - Speech recognition for Swedish time
 * Shows a clock with hands, player taps the microphone and says the time.
 * A miss shakes the clock while the right time is spoken, then the same time
 * is asked again. Accumulated progress is kept (the X correct don't have to
 * be in a row).
 */

const DEFAULT_CONFIG = { required: 3, includeHalfHours: true };

const CLOCK_Y = 240;
const CLOCK_RADIUS = 120;
const MIC_Y = 460;
const BALLS_Y = 640;

export class ClockReadingMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.correctCount = 0;

        // Default values (overridden by loadConfig)
        this.requiredCorrect = DEFAULT_CONFIG.required;
        this.includeHalfHours = DEFAULT_CONFIG.includeHalfHours;

        this.currentHour = null;
        this.currentMinute = null;
        this.hourHand = null;
        this.minuteHand = null;
        this.clockParts = [];       // Everything centred on the clock (for the shake)
        this.clockCenter = { x: 0, y: 0 };
        this.micButton = null;
        this.mic = null;
        this.speechHelper = new SpeechRecognitionHelper('sv-SE');
        this.configLoaded = false;
    }

    async loadConfig() {
        const config = await loadModeConfig('clockReading', DEFAULT_CONFIG);
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

        this.clockCenter = { x: width / 2, y: CLOCK_Y };
        this.createClock(scene);
        this.createMicrophoneButton(scene);
        this.createProgressBalls(scene, { total: this.requiredCorrect, completed: this.correctCount, y: BALLS_Y });
        this.initSpeechRecognition(scene);
    }

    createClock(scene) {
        const { x, y } = this.clockCenter;
        this.clockParts = [];

        const clockBg = scene.add.circle(x, y, CLOCK_RADIUS, COLORS.NEUTRAL_FILL, 1);
        clockBg.setStrokeStyle(6, COLORS.OUTLINE);
        this.uiElements.push(clockBg);
        this.clockParts.push(clockBg);

        // Only 12, 3, 6 and 9 are written out (learning content)
        for (const hour of [12, 3, 6, 9]) {
            const angle = (hour * 30 - 90) * Math.PI / 180; // -90 so 12 is at the top
            const markerRadius = CLOCK_RADIUS - 20;
            const marker = scene.add.text(x + Math.cos(angle) * markerRadius, y + Math.sin(angle) * markerRadius, hour.toString(), {
                fontSize: '28px',
                fontFamily: 'Arial',
                color: '#000000',
                fontStyle: 'bold'
            }).setOrigin(0.5);
            this.uiElements.push(marker);
        }

        // Small dots for the other hours
        for (let i = 0; i < 12; i++) {
            const angle = (i * 30 - 90) * Math.PI / 180;
            const dotRadius = CLOCK_RADIUS - 10;
            const dot = scene.add.circle(x + Math.cos(angle) * dotRadius, y + Math.sin(angle) * dotRadius, 3, COLORS.OUTLINE, 1);
            this.uiElements.push(dot);
        }

        // Hands pivot at the bottom (the clock centre)
        this.hourHand = scene.add.rectangle(x, y, 8, 50, 0x2C3E50, 1);
        this.hourHand.setOrigin(0.5, 1);
        this.uiElements.push(this.hourHand);

        this.minuteHand = scene.add.rectangle(x, y, 5, 85, 0xE74C3C, 1);
        this.minuteHand.setOrigin(0.5, 1);
        this.uiElements.push(this.minuteHand);

        const centerDot = scene.add.circle(x, y, 8, COLORS.OUTLINE, 1);
        this.uiElements.push(centerDot);

        this.clockParts.push(this.hourHand, this.minuteHand, centerDot);
        this.updateClockHands();
    }

    updateClockHands() {
        // The hour hand moves gradually (at 6:30 it sits between 6 and 7)
        this.hourHand.angle = (this.currentHour % 12) * 30 + (this.currentMinute / 60) * 30;
        this.minuteHand.angle = this.currentMinute * 6;
    }

    createMicrophoneButton(scene) {
        const width = scene.cameras.main.width;

        // Visual-only microphone state (grey idle, pulsing red listening,
        // ✅/❌ after a result, 🚫 when unavailable); no status text.
        this.mic = createMicButton(scene, this, {
            x: width / 2,
            y: MIC_Y,
            onTap: () => {
                if (!this.isInputBlocked() && !this.speechHelper.isListening) {
                    this.speechHelper.startListening(scene);
                }
            }
        });
        this.micButton = this.mic.button;
    }

    async initSpeechRecognition(scene) {
        const mic = this.mic;
        const setState = (state) => { if (this.mic === mic && mic) mic.setState(state); };

        this.speechHelper.onStatusChange = null;
        this.speechHelper.onResult = (transcript, results) => this.handleSpeechResult(scene, transcript, results);
        this.speechHelper.onError = () => setState(this.speechHelper.permissionGranted ? 'idle' : 'blocked');
        this.speechHelper.onStart = () => setState('listening');
        this.speechHelper.onEnd = () => {
            if (mic && mic.state === 'listening') setState('idle');
        };

        const success = await this.speechHelper.initialize(scene);

        // The UI may have been torn down (or rebuilt for the next challenge)
        // while we were waiting; don't touch a stale button.
        if (this.mic !== mic || !mic) return;

        if (success && this.speechHelper.permissionGranted) {
            mic.setState('idle');
            mic.enable();
        } else {
            mic.setState('blocked');
        }
    }

    handleSpeechResult(scene, transcript, results) {
        // Ignore results while an answer is being resolved / revealed
        if (this.isInputBlocked()) return;
        this.inputLocked = true;

        const matches = (t) => t && t.hour === this.currentHour && t.minute === this.currentMinute;

        // Any alternative that matches counts
        let spokenTime = null;
        for (let i = 0; i < results.length; i++) {
            const parsed = this.parseSwedishTime(results[i].transcript.toLowerCase().trim());
            if (matches(parsed)) {
                spokenTime = parsed;
                break;
            }
        }
        if (spokenTime === null) spokenTime = this.parseSwedishTime(transcript);

        if (matches(spokenTime)) {
            this.showCorrectFeedback(scene);
            this.correctCount++;
            this.updateProgressBalls(this.correctCount);

            if (this.correctCount >= this.requiredCorrect) {
                this.delayedCall(scene, 1000, () => {
                    this.finish(true, 'clock-reading', scene.cameras.main.width / 2, scene.cameras.main.height / 2);
                });
            } else {
                this.delayedCall(scene, 1000, () => this.restartChallenge(scene, { resetStreak: false }));
            }
        } else {
            const spokenStr = spokenTime ? `${spokenTime.hour}:${spokenTime.minute.toString().padStart(2, '0')}` : transcript;
            trackWrongAnswer(
                'ClockReadingMode',
                `${this.currentHour}:${this.currentMinute.toString().padStart(2, '0')}`,
                spokenStr
            );

            // Progress is kept; the same time comes straight back, and once
            // more a couple of rounds later
            const time = { hour: this.currentHour, minute: this.currentMinute };
            this.queueRetry(time);
            this.queueRetry({ ...time }, 2);

            this.showWrongFeedback(scene);
        }
    }

    parseSwedishTime(text) {
        // "klockan ett" = 1:00, "klockan halv två" = 1:30, "klockan halv ett" = 12:30
        text = text.toLowerCase().trim();

        // Remove "klockan" / "klockan är" prefix if present
        text = text.replace(/^klockan\s+(är\s+)?/, '');

        // Digits: "3", "3:00", "03.00", "3:30", "halv 3" (the recogniser often
        // returns numerals instead of number words)
        const digitMatch = text.match(/^(?:halv\s+)?(\d{1,2})(?:[:.]\s?(\d{2}))?$/);
        if (digitMatch) {
            const isHalv = text.startsWith('halv');
            const num = parseInt(digitMatch[1], 10);
            const mins = digitMatch[2] !== undefined ? parseInt(digitMatch[2], 10) : 0;
            if (num >= 1 && num <= 12) {
                if (isHalv && mins === 0) {
                    return { hour: num === 1 ? 12 : num - 1, minute: 30 };
                }
                if (!isHalv && (mins === 0 || mins === 30)) {
                    return { hour: num, minute: mins };
                }
            }
            return null;
        }

        const hourNames = {
            'ett': 1, 'en': 1, 'två': 2, 'tre': 3, 'fyra': 4, 'fem': 5, 'sex': 6,
            'sju': 7, 'åtta': 8, 'nio': 9, 'tio': 10, 'elva': 11, 'tolv': 12
        };

        // "halv X" means 30 minutes before hour X: "halv två" = 1:30
        // (\w does not match å/ä/ö, so the class is explicit)
        const halfMatch = text.match(/^halv\s+([a-zåäö]+)$/);
        if (halfMatch) {
            const nextHour = hourNames[halfMatch[1]];
            if (nextHour) return { hour: nextHour === 1 ? 12 : nextHour - 1, minute: 30 };
        }

        // Whole hours
        if (Object.prototype.hasOwnProperty.call(hourNames, text)) {
            return { hour: hourNames[text], minute: 0 };
        }

        return null;
    }

    showCorrectFeedback(scene) {
        // Green flash behind the microphone and on the clock
        if (this.mic) this.mic.setState('correct');
        const bg = scene.add.circle(this.micButton.x, this.micButton.y, 80, COLORS.CORRECT, 0.5);
        bg.setDepth(this.micButton.depth - 1);
        this.uiElements.push(bg);

        const clockFlash = scene.add.circle(this.clockCenter.x, this.clockCenter.y, 130, COLORS.CORRECT, 0.3);
        this.uiElements.push(clockFlash);

        this.showSuccessParticles(scene, this.clockCenter.x, this.clockCenter.y);
    }

    // Red flash + shake on the clock while the right time is spoken, then the
    // same time again on a fresh clock (streak reset).
    showWrongFeedback(scene) {
        if (this.mic) this.mic.setState('wrong');
        const wrongBg = scene.add.circle(this.micButton.x, this.micButton.y, 80, COLORS.WRONG, 0.5);
        wrongBg.setDepth(this.micButton.depth - 1);
        this.uiElements.push(wrongBg);

        const clockFlash = scene.add.circle(this.clockCenter.x, this.clockCenter.y, 130, COLORS.WRONG, 0.3);
        this.uiElements.push(clockFlash);

        const targets = [...this.clockParts, clockFlash];
        const originalX = this.clockCenter.x;
        this.addTween(scene, {
            targets,
            x: originalX - 10,
            duration: 50,
            yoyo: true,
            repeat: 3,
            onComplete: () => targets.forEach(el => { if (el.scene) el.x = originalX; })
        });

        this.revealAnswer(scene, {
            disable: [this.micButton],
            audioKey: clockAudioKey(this.currentHour, this.currentMinute)
        });
    }

    cleanup(scene) {
        // Destroys all UI elements, cancels pending timers/tweens, stops audio, unlocks input
        super.cleanup(scene);

        // Aborts a live recognition session, drops callbacks
        if (this.speechHelper) this.speechHelper.cleanup();

        this.micButton = null;
        this.mic = null;
        this.hourHand = null;
        this.minuteHand = null;
        this.clockParts = [];
    }
}
