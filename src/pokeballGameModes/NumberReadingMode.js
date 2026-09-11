import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { COLORS } from './uiKit.js';
import { trackWrongAnswer } from '../wrongAnswers.js';
import { showNumberProgressPopup } from './numberProgressPopup.js';
import { SpeechRecognitionHelper } from '../utils/speechRecognitionHelper.js';
import { createMicButton } from '../components/MicButton.js';
import { loadModeConfig } from '../minigameConfig.js';
import { parseNumberRange, range } from '../utils/parseNumberRange.js';
import { pickAdaptive, HARD_NUMBERS } from '../adaptive.js';
import { numberAudioKeys } from './NumberListeningMode.js';

/**
 * Number Reading Mode - Speech recognition for numbers
 * Shows a number, player taps the microphone and says it. A miss turns the
 * number gold while it is spoken aloud, then the same number is asked again.
 */

const DEFAULT_CONFIG = { required: 1, numbers: '10-99' };
const DEFAULT_POOL = range(10, 99);

const NUMBER_Y = 180;
const MIC_Y = 380;
const BALLS_Y = 550;

export class NumberReadingMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.correctInRow = 0;

        // Default values (overridden by loadConfig)
        this.requiredCorrect = DEFAULT_CONFIG.required;
        this.availableNumbers = [];
        this.clearedNumbers = new Set(); // Numbers answered correctly this session

        this.currentNumber = null;
        this.lastNumber = null; // Avoid asking the same number twice in a row
        this.displayedNumber = null;
        this.micButton = null;
        this.mic = null;
        this.wrongBg = null;
        this.speechHelper = new SpeechRecognitionHelper('sv-SE');
        this.initToken = 0; // Detects a stale async initialisation after cleanup
        this.configLoaded = false;
    }

    async loadConfig() {
        const config = await loadModeConfig('numberReading', DEFAULT_CONFIG);
        this.requiredCorrect = config.required || DEFAULT_CONFIG.required;
        this.availableNumbers = parseNumberRange(config.numbers, DEFAULT_POOL);
        this.configLoaded = true;
    }

    generateChallenge() {
        // Guard against generateChallenge() before loadConfig()
        if (!this.availableNumbers || this.availableNumbers.length === 0) {
            this.availableNumbers = [...DEFAULT_POOL];
        }

        // A missed number comes back first; otherwise weight the pick towards
        // the numbers the child gets wrong, never the same one twice in a row
        // when there is a choice.
        let number = this.takeRetry();
        if (number === undefined) {
            let pool = this.availableNumbers;
            if (pool.length > 1 && this.lastNumber !== null) {
                pool = pool.filter(n => n !== this.lastNumber);
            }
            number = pickAdaptive('NumberReadingMode', pool, { seedList: HARD_NUMBERS });
        }
        this.currentNumber = number;
        this.lastNumber = number;

        this.challengeData = { number };
        return this.challengeData;
    }

    createChallengeUI(scene) {
        const width = scene.cameras.main.width;

        // A fresh challenge always starts accepting input again.
        this.inputLocked = false;
        this.isRevealing = false;

        // The number to read (learning content)
        this.displayedNumber = scene.add.text(width / 2, NUMBER_Y, this.currentNumber.toString(), {
            fontSize: '120px',
            fontFamily: 'Arial',
            color: '#000000',
            fontStyle: 'bold',
            stroke: '#FFFFFF',
            strokeThickness: 6
        }).setOrigin(0.5);
        this.uiElements.push(this.displayedNumber);

        this.createMatrixIcon(scene, NUMBER_Y);
        this.createMicrophoneButton(scene);
        this.createProgressBalls(scene, { total: this.requiredCorrect, completed: this.correctInRow, y: BALLS_Y });
        this.initSpeechRecognition(scene);
    }

    createMatrixIcon(scene, numberY) {
        const width = scene.cameras.main.width;
        const iconX = width / 2 + 180;
        const iconY = numberY;
        const iconSize = 50;

        const iconBg = scene.add.rectangle(iconX, iconY, iconSize, iconSize, COLORS.NEUTRAL_STROKE, 0.8);
        iconBg.setStrokeStyle(3, COLORS.NEUTRAL_FILL);
        iconBg.setInteractive({ useHandCursor: true });
        iconBg.on('pointerdown', () => this.showMatrixPopup());
        this.uiElements.push(iconBg);

        // Mini 3x3 grid so the icon reads as "the number chart"
        const miniCellSize = 10;
        const miniGap = 3;
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                const x = iconX - miniCellSize - miniGap + col * (miniCellSize + miniGap);
                const y = iconY - miniCellSize - miniGap + row * (miniCellSize + miniGap);
                const miniCell = scene.add.rectangle(x, y, miniCellSize, miniCellSize, COLORS.NEUTRAL_FILL, 0.9);
                miniCell.setInteractive({ useHandCursor: true });
                miniCell.on('pointerdown', () => this.showMatrixPopup());
                this.uiElements.push(miniCell);
            }
        }
    }

    showMatrixPopup() {
        // Always show 0-99 regardless of configured numbers
        showNumberProgressPopup(this.clearedNumbers, 0, 99);
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
        const token = ++this.initToken;
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

        // The mode may have been cleaned up (or moved to the next challenge)
        // while we were waiting; that challenge's own init takes over.
        if (token !== this.initToken || this.mic !== mic || !mic) return;

        if (success && this.speechHelper.permissionGranted) {
            mic.setState('idle');
            mic.enable();
        } else {
            mic.setState('blocked');
        }
    }

    handleSpeechResult(scene, transcript, results) {
        // Ignore results while an answer is being resolved or revealed
        if (this.isInputBlocked() || !this.displayedNumber) return;

        // Any alternative that matches counts
        let spokenNumber = null;
        for (let i = 0; i < results.length; i++) {
            const parsed = this.parseSwedishNumber(results[i].transcript.toLowerCase().trim());
            if (parsed === this.currentNumber) {
                spokenNumber = parsed;
                break;
            }
        }
        if (spokenNumber === null) spokenNumber = this.parseSwedishNumber(transcript);

        this.inputLocked = true;

        if (spokenNumber === this.currentNumber) {
            this.showCorrectFeedback(scene);
            this.correctInRow++;
            this.clearedNumbers.add(this.currentNumber);
            this.updateProgressBalls(this.correctInRow);

            if (this.correctInRow >= this.requiredCorrect) {
                this.delayedCall(scene, 1000, () => {
                    this.finish(true, 'number-reading', scene.cameras.main.width / 2, scene.cameras.main.height / 2);
                });
            } else {
                this.delayedCall(scene, 1000, () => this.restartChallenge(scene, { resetStreak: false }));
            }
        } else {
            trackWrongAnswer(
                'NumberReadingMode',
                this.currentNumber.toString(),
                spokenNumber !== null ? spokenNumber.toString() : transcript
            );

            this.correctInRow = 0;
            this.updateProgressBalls(0);

            // Same number straight away, and once more a couple of rounds later
            this.queueRetry(this.currentNumber);
            this.queueRetry(this.currentNumber, 2);

            this.showWrongFeedback(scene);
        }
    }

    parseSwedishNumber(text) {
        // Map Swedish number words to digits (0-99)
        const numberMap = {
            'noll': 0, 'ett': 1, 'en': 1, 'två': 2, 'tre': 3, 'fyra': 4,
            'fem': 5, 'sex': 6, 'sju': 7, 'åtta': 8, 'nio': 9,
            'tio': 10, 'elva': 11, 'tolv': 12, 'tretton': 13, 'fjorton': 14,
            'femton': 15, 'sexton': 16, 'sjutton': 17, 'arton': 18, 'nitton': 19,
            'tjugo': 20, 'trettio': 30, 'fyrtio': 40, 'femtio': 50,
            'sextio': 60, 'sjuttio': 70, 'åttio': 80, 'nittio': 90
        };
        const tensWords = ['tjugo', 'trettio', 'fyrtio', 'femtio', 'sextio', 'sjuttio', 'åttio', 'nittio'];

        text = String(text || '').toLowerCase().trim();

        if (Object.prototype.hasOwnProperty.call(numberMap, text)) {
            return numberMap[text];
        }

        // Already a digit string
        if (/^\d/.test(text)) {
            const directNumber = parseInt(text, 10);
            if (!isNaN(directNumber) && directNumber >= 0) return directNumber;
        }

        // Compound numbers as two words ("tjugo tre" = 23)
        const words = text.split(/\s+/);
        if (words.length === 2) {
            const tens = numberMap[words[0]];
            const ones = numberMap[words[1]];
            if (tens && tens >= 20 && tens <= 90 && ones && ones >= 1 && ones <= 9) {
                return tens + ones;
            }
        }

        // Spoken Swedish compounds are written as one word ("tjugotre", "trettiofem")
        if (words.length === 1) {
            for (const tensWord of tensWords) {
                if (text.startsWith(tensWord) && text.length > tensWord.length) {
                    const ones = numberMap[text.slice(tensWord.length)];
                    if (ones && ones >= 1 && ones <= 9) return numberMap[tensWord] + ones;
                }
            }
        }

        return null;
    }

    showCorrectFeedback(scene) {
        // Green flash behind the microphone and on the number
        if (this.mic) this.mic.setState('correct');
        const bg = scene.add.circle(this.micButton.x, this.micButton.y, 80, COLORS.CORRECT, 0.5);
        bg.setDepth(this.micButton.depth - 1);
        this.uiElements.push(bg);
        this.displayedNumber.setColor('#27AE60');

        this.showSuccessParticles(scene, scene.cameras.main.width / 2, NUMBER_Y);
    }

    // Red shake on the number, then gold while it is spoken, then the same
    // number again on a fresh board.
    showWrongFeedback(scene) {
        this.isRevealing = true;

        if (this.mic) this.mic.setState('wrong');

        this.wrongBg = scene.add.circle(this.micButton.x, this.micButton.y, 80, COLORS.WRONG, 0.5);
        this.wrongBg.setDepth(this.micButton.depth - 1);
        this.uiElements.push(this.wrongBg);

        const displayedNumber = this.displayedNumber;
        displayedNumber.setColor('#FF0000');
        this.shakeWrong(scene, displayedNumber, {
            restore: false,
            onComplete: () => {
                if (!displayedNumber.scene) return;
                displayedNumber.setColor('#FFD700');
                this.revealAnswer(scene, {
                    targets: [displayedNumber],
                    disable: [this.micButton],
                    audioKeys: numberAudioKeys(this.currentNumber)
                });
            }
        });
    }

    cleanup(scene) {
        // Cancels pending timers/tweens, stops audio, destroys uiElements, unlocks input
        super.cleanup(scene);

        // Aborts a live recognition session, drops callbacks
        if (this.speechHelper) this.speechHelper.cleanup();
        // Any initialisation still in flight belongs to a torn-down challenge
        this.initToken++;

        this.micButton = null;
        this.mic = null;
        this.wrongBg = null;
        this.displayedNumber = null;
    }
}
