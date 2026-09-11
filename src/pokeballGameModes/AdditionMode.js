import Phaser from 'phaser';
import { TwoDigitDropBase } from './TwoDigitDropBase.js';
import { COLORS } from './uiKit.js';
import { trackWrongAnswer } from '../wrongAnswers.js';
import { loadModeConfig } from '../minigameConfig.js';

/**
 * Addition game mode
 * Player solves simple addition problems by dragging digits into a tens and a
 * ones slot (the shared TwoDigitDropBase engine). A miss shows the right
 * digits in gold while the sum is spoken, and the same problem comes back
 * straight away and once more a couple of rounds later.
 * Configurable: number of terms, maximum sum, and whether only one term can
 * have multiple digits.
 */

// The answer has a tens and a ones slot, so sums must stay below 100.
const MAX_TWO_DIGIT_SUM = 99;

const DEFAULT_CONFIG = { numberOfTerms: 2, maxSum: MAX_TWO_DIGIT_SUM, onlyOneMultiDigit: true };

const PROBLEM_Y = 180;
const DROP_ZONE_Y = 320;
const BALLS_Y = 470;
const DIGIT_START_Y = 580;

export class AdditionMode extends TwoDigitDropBase {
    constructor() {
        super();
        this.correctInRow = 0;
        this.requiredCorrect = 3;

        // Default settings (loaded from config)
        this.numberOfTerms = DEFAULT_CONFIG.numberOfTerms;
        this.maxSum = DEFAULT_CONFIG.maxSum;
        this.onlyOneMultiDigit = DEFAULT_CONFIG.onlyOneMultiDigit;
        this.configLoaded = false;
    }

    async loadConfig() {
        const config = await loadModeConfig('addition', DEFAULT_CONFIG);
        this.numberOfTerms = Math.max(1, Math.floor(config.numberOfTerms) || DEFAULT_CONFIG.numberOfTerms);
        // Two drop zones: the sum can never need three digits
        const maxSum = Math.floor(config.maxSum) || MAX_TWO_DIGIT_SUM;
        this.maxSum = Math.max(1, Math.min(maxSum, MAX_TWO_DIGIT_SUM));
        this.onlyOneMultiDigit = config.onlyOneMultiDigit !== false;
        this.configLoaded = true;
    }

    generateChallenge() {
        // A missed problem comes back first
        let terms = this.takeRetry();
        if (!terms) {
            const previous = this.challengeData ? this.challengeData.terms.join('+') : null;
            terms = this.generateTerms();
            // Don't show the very same problem twice in a row
            for (let attempt = 0; attempt < 10 && terms.join('+') === previous; attempt++) {
                terms = this.generateTerms();
            }
        }

        const correctAnswer = terms.reduce((sum, term) => sum + term, 0);
        this.challengeData = {
            terms,
            correctAnswer,
            tens: Math.floor(correctAnswer / 10),
            ones: correctAnswer % 10
        };
        return this.challengeData;
    }

    generateTerms() {
        const terms = [];
        let sum = 0;
        let multiDigitCount = 0;

        for (let i = 0; i < this.numberOfTerms; i++) {
            let term;
            const remainingTerms = this.numberOfTerms - i - 1;
            const maxPossibleTerm = this.maxSum - sum - remainingTerms;

            if (maxPossibleTerm <= 0) {
                term = 0;
            } else if (this.onlyOneMultiDigit && multiDigitCount > 0) {
                // Only single digits allowed from now on
                term = Phaser.Math.Between(0, Math.min(9, maxPossibleTerm));
            } else if (this.onlyOneMultiDigit && i === this.numberOfTerms - 1 && multiDigitCount === 0
                       && maxPossibleTerm >= 10) {
                // Last term and no multi-digit yet: force one (when there is room)
                term = Phaser.Math.Between(10, maxPossibleTerm);
                multiDigitCount++;
            } else if (this.onlyOneMultiDigit) {
                // Randomly decide if this should be the multi-digit term
                if (Math.random() < 0.5 && maxPossibleTerm >= 10) {
                    term = Phaser.Math.Between(10, maxPossibleTerm);
                    multiDigitCount++;
                } else {
                    term = Phaser.Math.Between(0, Math.min(9, maxPossibleTerm));
                }
            } else {
                term = Phaser.Math.Between(0, maxPossibleTerm);
                if (term >= 10) multiDigitCount++;
            }

            terms.push(term);
            sum += term;
        }

        return terms;
    }

    getCorrectAnswer() {
        return this.challengeData.correctAnswer;
    }

    createChallengeUI(scene) {
        const width = scene.cameras.main.width;
        this.inputLocked = false;
        this.isRevealing = false;

        // The problem itself is the only prompt (learning content, no instructions)
        const problemText = this.challengeData.terms.join(' + ') + ' = ?';
        const problemDisplay = scene.add.text(width / 2, PROBLEM_Y, problemText, {
            font: 'bold 64px Arial',
            fill: COLORS.TEXT_DARK
        }).setOrigin(0.5);
        this.uiElements.push(problemDisplay);

        this.createDropZones(scene, DROP_ZONE_Y);
        this.createProgressBalls(scene, { total: this.requiredCorrect, completed: this.correctInRow, y: BALLS_Y });
        this.createDigitBoxes(scene, DIGIT_START_Y);
    }

    handleCorrectAnswer(answer) {
        const scene = this.currentScene();
        // No more drops while the feedback plays
        this.inputLocked = true;
        this.correctInRow++;
        this.updateProgressBalls(this.correctInRow);
        this.flashZones(COLORS.CORRECT);

        if (this.correctInRow >= this.requiredCorrect) {
            const x = this.onesZone.x;
            const y = this.onesZone.y;
            this.delayedCall(scene, 500, () => this.finish(true, answer, x, y));
        } else {
            this.delayedCall(scene, 800, () => this.restartChallenge(scene, { resetStreak: false }));
        }
    }

    handleWrongAnswer(playerAnswer) {
        const scene = this.currentScene();
        const { terms, correctAnswer, tens, ones } = this.challengeData;
        this.isRevealing = true;
        this.inputLocked = true;
        this.correctInRow = 0;
        this.updateProgressBalls(0);

        trackWrongAnswer('AdditionMode', String(correctAnswer), String(playerAnswer));

        // Same problem straight away, and once more a couple of rounds later
        this.queueRetry([...terms]);
        this.queueRetry([...terms], 2);

        // Red shake, then the correct digits in gold while the sum is spoken,
        // then a fresh board (streak reset) with the same problem.
        this.flashZones(COLORS.WRONG);
        this.shakeZones(scene, () => {
            this.showCorrectDigits(tens, ones);
            this.revealAnswer(scene, {
                targets: this.getZones(),
                audioKey: `number_audio_${correctAnswer}`
            });
        });
    }
}
