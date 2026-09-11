import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { COLORS, LAYOUT, wireButtonHover, resetButtonStyle } from './uiKit.js';
import { trackWrongAnswer } from '../wrongAnswers.js';
import { loadModeConfig } from '../minigameConfig.js';

/**
 * Number bonds game mode ("tiokompisar")
 *
 * How many more to reach ten? 7 needs 3, 4 needs 6. The pairs are shown on a
 * ten-frame - ten slots, some filled with pokeballs, the rest empty - so the
 * answer can be counted before it is known by heart. The frame can be turned off
 * from the admin panel once the facts are memorised.
 *
 * Timed, and paid like SpeedReadingMode: the reward accelerates with the number
 * of correct answers and reaches maxCoins at targetCount, which also ends the
 * round early. A wrong tap costs nothing but the seconds it took; the same
 * problem stays up until it is solved and comes back once more later on.
 */

// ⚙️ DEFAULTS (overridable from public/config/minigames.json → numberBonds)
const DEFAULT_CONFIG = {
    sum: 10,                // "Tiokompisar" - the whole is ten
    durationSeconds: 60,    // Seconds on the clock
    targetCount: 20,        // Correct answers for the full reward
    maxCoins: 100,          // Reward at (and capped to) the target
    showTenFrame: true
};

// Layout for the 1280x900 canvas
const TIMER_Y = LAYOUT.TIMER_Y;
const COIN_Y = LAYOUT.COIN_Y;
const BAR_MARGIN = LAYOUT.BAR_MARGIN;
const FRAME_TOP = 330;
const PROBLEM_Y = 500;
const KEYPAD_TOP = 610;

const FRAME_CELL = 68;
const KEY_SIZE = 88;
const KEY_GAP = 18;
const KEYS_PER_ROW = 6;

export class NumberBondsMode extends BasePokeballGameMode {
    constructor() {
        super();

        // Config (loaded from server, falls back to defaults)
        this.sum = DEFAULT_CONFIG.sum;
        this.durationSeconds = DEFAULT_CONFIG.durationSeconds;
        this.targetCount = DEFAULT_CONFIG.targetCount;
        this.maxCoins = DEFAULT_CONFIG.maxCoins;
        this.showTenFrame = DEFAULT_CONFIG.showTenFrame;
        this.configLoaded = false;

        // Scoring / timing
        this.correctCount = 0;
        this.earnedCoins = 0;       // Read by PokeballGameScene for the reward
        this.paysOwnCoins = true;   // ... instead of the streak/multiplier payout
        this.timeLeft = DEFAULT_CONFIG.durationSeconds;
        this.timerEvent = null;
        this.gameActive = false;
        this.finished = false;
        this.isResolving = false;   // Brief lockout while the frame completes

        // UI references
        this.timerBarFill = null;
        this.timerBarWidth = 0;
        this.timerBarX = 0;
        this.progressBarFill = null;
        this.progressBarWidth = 0;
        this.progressBarX = 0;
        this.coinCountText = null;
        this.problemText = null;
        this.frameSlots = [];       // { cell, ball }
        this.keyButtons = [];       // { rect, label, value }
    }

    async loadConfig() {
        const config = await loadModeConfig('numberBonds', DEFAULT_CONFIG);
        this.sum = config.sum || DEFAULT_CONFIG.sum;
        this.durationSeconds = config.durationSeconds || DEFAULT_CONFIG.durationSeconds;
        this.targetCount = config.targetCount || DEFAULT_CONFIG.targetCount;
        this.maxCoins = config.maxCoins || DEFAULT_CONFIG.maxCoins;
        this.showTenFrame = config.showTenFrame !== false;
        this.timeLeft = this.durationSeconds;
        this.configLoaded = true;
    }

    generateChallenge() {
        const previous = this.challengeData ? this.challengeData.given : null;

        // A missed first term comes back later, otherwise a random one - but
        // never the same first term twice in a row: a repeat can be answered
        // without looking, which is free points in a timed game.
        let given = this.takeRetry();
        if (given === undefined || given === previous) {
            do {
                given = Math.floor(Math.random() * (this.sum + 1));
            } while (given === previous && this.sum > 0);
        }

        this.challengeData = { given, answer: this.sum - given };
        return this.challengeData;
    }

    createChallengeUI(scene) {
        // The bars and the keypad outlive a single challenge - only the numbers
        // change - so build them once and just refresh them afterwards.
        if (this.keyButtons.length === 0) {
            this.isResolving = false;
            this.createTimerBar(scene);
            this.createCoinBar(scene);
            this.createProblem(scene);
            if (this.showTenFrame) this.createTenFrame(scene);
            this.createKeypad(scene);
            this.startTimer(scene);
        }
        this.refreshChallenge();
    }

    // ---------------- Static furniture ----------------

    createTimerBar(scene) {
        const width = scene.cameras.main.width;
        this.timerBarX = BAR_MARGIN;
        this.timerBarWidth = width - BAR_MARGIN * 2;

        const clock = scene.add.text(BAR_MARGIN - 70, TIMER_Y, '⏱️', { fontSize: '48px' }).setOrigin(0.5);
        this.uiElements.push(clock);

        const bg = scene.add.rectangle(this.timerBarX, TIMER_Y, this.timerBarWidth, 34, COLORS.NEUTRAL_FILL)
            .setOrigin(0, 0.5);
        bg.setStrokeStyle(3, 0x2C3E50);
        this.uiElements.push(bg);

        this.timerBarFill = scene.add.rectangle(this.timerBarX, TIMER_Y, this.timerBarWidth, 34, 0x2ECC71)
            .setOrigin(0, 0.5);
        this.uiElements.push(this.timerBarFill);
    }

    createCoinBar(scene) {
        const width = scene.cameras.main.width;
        this.progressBarX = BAR_MARGIN;
        this.progressBarWidth = width - BAR_MARGIN * 2;

        const coinIcon = scene.add.text(BAR_MARGIN - 70, COIN_Y, '🪙', { fontSize: '48px' }).setOrigin(0.5);
        this.uiElements.push(coinIcon);

        const bg = scene.add.rectangle(this.progressBarX, COIN_Y, this.progressBarWidth, 40, COLORS.NEUTRAL_FILL)
            .setOrigin(0, 0.5);
        bg.setStrokeStyle(3, 0xB8860B);
        this.uiElements.push(bg);

        this.progressBarFill = scene.add.rectangle(this.progressBarX, COIN_Y, 0, 40, COLORS.REVEAL)
            .setOrigin(0, 0.5);
        this.uiElements.push(this.progressBarFill);

        // Tick marks every 5 answers on the way to the target.
        const tickStep = 5;
        for (let c = tickStep; c < this.targetCount; c += tickStep) {
            const tx = this.progressBarX + (c / this.targetCount) * this.progressBarWidth;
            const tick = scene.add.rectangle(tx, COIN_Y, 3, 40, 0xB8860B).setOrigin(0.5);
            this.uiElements.push(tick);
        }

        const trophy = scene.add.text(this.progressBarX + this.progressBarWidth + 40, COIN_Y, '🏆', {
            fontSize: '44px'
        }).setOrigin(0.5);
        this.uiElements.push(trophy);

        this.coinCountText = scene.add.text(width / 2, COIN_Y, '0', {
            fontSize: '28px',
            fontFamily: 'Arial',
            color: '#7A5C00',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.uiElements.push(this.coinCountText);
    }

    createProblem(scene) {
        this.problemText = scene.add.text(scene.cameras.main.width / 2, PROBLEM_Y, '', {
            font: 'bold 76px Arial',
            fill: COLORS.TEXT_DARK
        }).setOrigin(0.5);
        this.uiElements.push(this.problemText);
    }

    // Ten slots in two rows of five - the standard ten-frame. Filled slots are
    // what you have, empty ones are what the answer counts.
    createTenFrame(scene) {
        const width = scene.cameras.main.width;
        const perRow = Math.ceil(this.sum / 2);
        const rows = this.sum > perRow ? 2 : 1;
        const gridWidth = perRow * FRAME_CELL;
        const startX = width / 2 - gridWidth / 2 + FRAME_CELL / 2;

        this.frameSlots = [];
        for (let i = 0; i < this.sum; i++) {
            const row = Math.floor(i / perRow);
            const col = i % perRow;
            const x = startX + col * FRAME_CELL;
            const y = FRAME_TOP + row * FRAME_CELL + (rows === 1 ? FRAME_CELL / 2 : 0);

            const cell = scene.add.rectangle(x, y, FRAME_CELL - 6, FRAME_CELL - 6, COLORS.NEUTRAL_FILL, 0.5);
            cell.setStrokeStyle(3, 0x2C3E50);
            this.uiElements.push(cell);

            const ball = scene.add.image(x, y, 'pokeball_poke-ball-tiny');
            ball.setDisplaySize(FRAME_CELL * 0.62, FRAME_CELL * 0.62);
            this.uiElements.push(ball);

            this.frameSlots.push({ cell, ball });
        }
    }

    createKeypad(scene) {
        const width = scene.cameras.main.width;
        const count = this.sum + 1;                       // 0 through sum
        const isLocked = () => this.isResolving || !this.gameActive;

        this.keyButtons = [];
        for (let value = 0; value < count; value++) {
            const row = Math.floor(value / KEYS_PER_ROW);
            const col = value % KEYS_PER_ROW;
            const inThisRow = Math.min(KEYS_PER_ROW, count - row * KEYS_PER_ROW);
            const rowWidth = inThisRow * KEY_SIZE + (inThisRow - 1) * KEY_GAP;
            const x = width / 2 - rowWidth / 2 + KEY_SIZE / 2 + col * (KEY_SIZE + KEY_GAP);
            const y = KEYPAD_TOP + row * (KEY_SIZE + KEY_GAP);

            const rect = scene.add.rectangle(x, y, KEY_SIZE, KEY_SIZE, COLORS.NEUTRAL_FILL);
            rect.setStrokeStyle(4, COLORS.NEUTRAL_STROKE);
            rect.setInteractive({ useHandCursor: true });
            this.uiElements.push(rect);

            const label = scene.add.text(x, y, `${value}`, {
                fontSize: '46px',
                fontFamily: 'Arial',
                color: COLORS.TEXT_DARK,
                fontStyle: 'bold'
            }).setOrigin(0.5);
            this.uiElements.push(label);

            wireButtonHover(rect, isLocked);
            rect.on('pointerdown', () => this.handleKey(scene, value, rect));

            this.keyButtons.push({ rect, label, value });
        }
    }

    // ---------------- Per-challenge refresh ----------------

    // Nothing here may hint at the answer - only the first term is drawn.
    refreshChallenge() {
        const { given } = this.challengeData;
        if (this.problemText) this.problemText.setText(`${given} + ? = ${this.sum}`);

        this.frameSlots.forEach((slot, i) => {
            const filled = i < given;
            slot.ball.setVisible(filled);
            slot.cell.setFillStyle(COLORS.NEUTRAL_FILL, filled ? 0.5 : 0.18);
        });

        this.keyButtons.forEach(({ rect }) => resetButtonStyle(rect));
    }

    // ---------------- Answering ----------------

    handleKey(scene, value, rect) {
        if (!this.gameActive || this.isResolving) return;

        if (value === this.challengeData.answer) {
            this.handleCorrect(scene, rect);
        } else {
            trackWrongAnswer('NumberBondsMode', `${this.challengeData.given}+?=${this.sum}`, String(value));
            // A quick red flash; the same challenge stays up (no penalty beyond
            // the seconds it cost) and comes back once more later on.
            this.queueRetry(this.challengeData.given, 2);
            rect.setFillStyle(COLORS.WRONG, 0.6);
            this.delayedCall(scene, 220, () => resetButtonStyle(rect));
        }
    }

    handleCorrect(scene, rect) {
        this.isResolving = true;
        this.correctCount++;
        this.earnedCoins = this.coinsForCount(this.correctCount);
        this.updateProgressBar();

        rect.setFillStyle(COLORS.CORRECT, 0.6);

        // The payoff: the empty slots fill in, completing the ten.
        const { given } = this.challengeData;
        this.frameSlots.forEach((slot, i) => {
            if (i < given) return;
            slot.ball.setVisible(true);
            slot.ball.setTint(COLORS.CORRECT);
            slot.cell.setFillStyle(COLORS.CORRECT, 0.35);
        });

        if (this.correctCount >= this.targetCount) {
            this.finishGame(scene);
            return;
        }

        this.delayedCall(scene, 320, () => {
            if (!this.gameActive) return;
            this.frameSlots.forEach(slot => slot.ball.clearTint());
            resetButtonStyle(rect);
            this.isResolving = false;
            this.generateChallenge();
            this.refreshChallenge();
        });
    }

    // Reward accelerates with the number of answers: quadratic up to targetCount,
    // matching SpeedReadingMode so the two timed games feel the same.
    coinsForCount(count) {
        if (count <= 0) return 0;
        const fraction = Math.min(1, count / this.targetCount);
        return Math.max(1, Math.round(this.maxCoins * fraction * fraction));
    }

    // ---------------- Timer ----------------

    startTimer(scene) {
        this.gameActive = true;
        this.timeLeft = this.durationSeconds;

        // A looping event; the base helpers only cover one-shot timers, so this
        // one is removed explicitly in finishGame()/cleanup().
        this.timerEvent = scene.time.addEvent({
            delay: 100,
            loop: true,
            callback: () => {
                this.timeLeft -= 0.1;
                if (this.timeLeft <= 0) {
                    this.timeLeft = 0;
                    this.updateTimerBar();
                    this.finishGame(scene);
                } else {
                    this.updateTimerBar();
                }
            }
        });
    }

    updateTimerBar() {
        if (!this.timerBarFill) return;
        const fraction = Math.max(0, this.timeLeft / this.durationSeconds);
        this.timerBarFill.width = this.timerBarWidth * fraction;
        // Green → orange → red as time runs out.
        let color = 0x2ECC71;
        if (fraction < 0.25) color = 0xE74C3C;
        else if (fraction < 0.5) color = 0xF39C12;
        this.timerBarFill.setFillStyle(color);
    }

    updateProgressBar() {
        if (!this.progressBarFill) return;
        // The bar tracks answers (steady progress); the number shows the
        // accelerating coins.
        const fraction = Math.min(1, this.correctCount / this.targetCount);
        this.progressBarFill.width = this.progressBarWidth * fraction;
        if (this.coinCountText) this.coinCountText.setText(`${this.earnedCoins}`);
    }

    finishGame(scene) {
        if (!this.gameActive) return;
        this.gameActive = false;
        this.finished = true;
        this.isResolving = true;

        if (this.timerEvent) {
            this.timerEvent.remove();
            this.timerEvent = null;
        }

        if (this.problemText) {
            this.problemText.setText(`🎉 ${this.earnedCoins} 🪙`);
        }

        // Hand the earned coins to the scene for the reward animation.
        this.delayedCall(scene, 900, () => {
            this.finish(true, this.challengeData.answer, scene.cameras.main.width / 2, scene.cameras.main.height / 2);
        });
    }

    checkAnswer(answer) {
        return answer === this.challengeData.answer;
    }

    cleanup(scene) {
        if (this.timerEvent) {
            this.timerEvent.remove();
            this.timerEvent = null;
        }
        this.gameActive = false;

        super.cleanup(scene);
        this.frameSlots = [];
        this.keyButtons = [];
        this.problemText = null;
        this.timerBarFill = null;
        this.progressBarFill = null;
        this.coinCountText = null;
        this.isResolving = false;
    }
}
