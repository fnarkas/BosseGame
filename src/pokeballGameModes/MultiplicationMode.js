import Phaser from 'phaser';
import { TwoDigitDropBase } from './TwoDigitDropBase.js';
import { COLORS } from './uiKit.js';
import { trackWrongAnswer } from '../wrongAnswers.js';
import { loadModeConfig } from '../minigameConfig.js';
import { parseNumberRange } from '../utils/parseNumberRange.js';

/**
 * Multiplication game mode
 * The problem is drawn as an array: `rows` rows of `cols` pokeballs, so the
 * answer can always be counted by hand. After every answer — right or wrong —
 * the rows light up one at a time while the voice skip-counts (10, 20, 30),
 * which is the bridge from counting to multiplication. On a correct answer the
 * array then transposes so `3 × 10` becomes `10 × 3` with the same balls,
 * showing commutativity instead of telling it. A missed problem comes back
 * straight away and once more a couple of rounds later.
 * Player answers by dragging digits into tens/ones slots (TwoDigitDropBase).
 */

// Layout constants for the 1280x900 canvas. The booster bar occupies y 35-85,
// so everything starts below it.
const PROBLEM_Y = 140;
const GRID_CENTER_Y = 320;
const GRID_BOX_WIDTH = 900;
const GRID_BOX_HEIGHT = 260;
const MAX_CELL = 72;
const DROP_ZONE_Y = 525;
const BALLS_Y = 615;
const DIGIT_START_Y = 690;

// Two drop zones (tens + ones), so products must stay below 100.
const MAX_TWO_DIGIT_PRODUCT = 99;
const DEFAULT_TABLES = [2, 5, 10];

const DEFAULT_CONFIG = {
    required: 3,
    tables: '2,5,10',
    maxFactor: 10,
    maxProduct: MAX_TWO_DIGIT_PRODUCT,
    showCommutativity: true
};

export class MultiplicationMode extends TwoDigitDropBase {
    constructor() {
        super();
        this.correctCount = 0;
        this.requiredCorrect = DEFAULT_CONFIG.required;

        // Array visualisation
        this.gridItems = [];        // Pokeball images, row-major (r * cols + c)
        this.rowHighlights = [];    // One faint band per row, greened during the reveal
        this.rowTotals = [];        // Running total per row, revealed one at a time
        this.problemDisplay = null;

        // Default settings (loaded from config)
        this.tables = [...DEFAULT_TABLES];   // Group size = number of columns
        this.maxFactor = DEFAULT_CONFIG.maxFactor;     // Number of groups = number of rows
        this.maxProduct = DEFAULT_CONFIG.maxProduct;   // Two drop zones, so answers must stay below 100
        this.commutativityEnabled = DEFAULT_CONFIG.showCommutativity;
        this.configLoaded = false;
    }

    async loadConfig() {
        const config = await loadModeConfig('multiplication', DEFAULT_CONFIG);
        this.requiredCorrect = Math.floor(config.required) || DEFAULT_CONFIG.required;
        // A table of 0 makes no sense; fall back to the defaults when nothing valid is left
        const tables = parseNumberRange(config.tables, []).filter(n => n >= 1);
        this.tables = tables.length > 0 ? tables : [...DEFAULT_TABLES];
        this.maxFactor = Math.max(1, Math.floor(config.maxFactor) || DEFAULT_CONFIG.maxFactor);
        const maxProduct = Math.floor(config.maxProduct) || DEFAULT_CONFIG.maxProduct;
        this.maxProduct = Math.max(1, Math.min(maxProduct, MAX_TWO_DIGIT_PRODUCT));
        this.commutativityEnabled = config.showCommutativity !== false;
        this.configLoaded = true;
    }

    generateChallenge() {
        // A missed problem comes back first
        const retry = this.takeRetry();
        let rows, cols;
        if (retry) {
            ({ rows, cols } = retry);
        } else {
            // Draw a table and a factor, retrying while the product needs three
            // digits (the answer only has a tens and a ones slot) or repeats the
            // problem that was just shown.
            const previous = this.challengeData;
            let attempts = 0;
            do {
                cols = this.tables[Phaser.Math.Between(0, this.tables.length - 1)];
                rows = Phaser.Math.Between(1, this.maxFactor);
                attempts++;
            } while ((rows * cols > this.maxProduct ||
                      (previous && previous.rows === rows && previous.cols === cols && attempts < 10))
                     && attempts < 50);

            // Safety net if the config makes every product too large.
            if (rows * cols > this.maxProduct) {
                cols = Math.min(...this.tables);
                rows = Math.max(1, Math.floor(this.maxProduct / cols));
            }
        }

        const product = rows * cols;
        this.challengeData = {
            rows,               // Number of groups
            cols,               // Group size — the table being practised
            product,
            tens: Math.floor(product / 10),
            ones: product % 10
        };
        return this.challengeData;
    }

    getCorrectAnswer() {
        return this.challengeData.product;
    }

    createChallengeUI(scene) {
        const width = scene.cameras.main.width;
        this.inputLocked = false;
        this.isRevealing = false;

        // The problem itself is the only prompt — no instructions.
        this.problemDisplay = scene.add.text(
            width / 2,
            PROBLEM_Y,
            `${this.challengeData.rows} × ${this.challengeData.cols}`,
            { font: 'bold 64px Arial', fill: COLORS.TEXT_DARK }
        ).setOrigin(0.5);
        this.uiElements.push(this.problemDisplay);

        // Speaker replays the spoken problem, but never interrupts the skip-count lesson
        this.createSpeakerButton(scene, width / 2 + 180, PROBLEM_Y, () => {
            if (!this.isRevealing) this.playProblemAudio(scene);
        }, { fontSize: '56px' });

        this.createGrid(scene);
        this.createDropZones(scene, DROP_ZONE_Y);
        this.createProgressBalls(scene, { total: this.requiredCorrect, completed: this.correctCount, y: BALLS_Y });
        this.createDigitBoxes(scene, DIGIT_START_Y);

        // Say the problem out loud as the round starts
        this.delayedCall(scene, 250, () => this.playProblemAudio(scene));
    }

    // ---------------- Array visualisation ----------------

    // Geometry for a rows x cols array, so the reveal and the transpose can
    // both ask for positions with the same maths.
    gridGeometry(rows, cols, width) {
        const cell = Math.min(GRID_BOX_WIDTH / cols, GRID_BOX_HEIGHT / rows, MAX_CELL);
        const gridWidth = cell * cols;
        const gridHeight = cell * rows;
        return {
            cell,
            gridWidth,
            gridHeight,
            startX: width / 2 - gridWidth / 2 + cell / 2,
            startY: GRID_CENTER_Y - gridHeight / 2 + cell / 2
        };
    }

    createGrid(scene) {
        const width = scene.cameras.main.width;
        const { rows, cols } = this.challengeData;
        const geo = this.gridGeometry(rows, cols, width);

        this.gridItems = [];
        this.rowHighlights = [];
        this.rowTotals = [];

        for (let r = 0; r < rows; r++) {
            const y = geo.startY + r * geo.cell;

            // Faint band behind each row so the rows read as equal groups
            const band = scene.add.rectangle(
                width / 2, y, geo.gridWidth + 20, geo.cell,
                COLORS.NEUTRAL_FILL, r % 2 === 0 ? 0.28 : 0.14
            );
            this.rowHighlights.push(band);
            this.uiElements.push(band);

            // Running total for this row, hidden until the reveal reaches it
            const total = scene.add.text(width / 2 + geo.gridWidth / 2 + 45, y, '', {
                fontSize: '36px',
                fontFamily: 'Arial',
                color: '#7A5C00',
                fontStyle: 'bold'
            }).setOrigin(0, 0.5);
            total.setAlpha(0);
            this.rowTotals.push(total);
            this.uiElements.push(total);

            for (let c = 0; c < cols; c++) {
                const ball = scene.add.image(geo.startX + c * geo.cell, y, 'pokeball_poke-ball-tiny');
                ball.setDisplaySize(geo.cell * 0.78, geo.cell * 0.78);
                this.gridItems.push(ball);
                this.uiElements.push(ball);
            }
        }
    }

    // ---------------- Answer handling ----------------

    handleCorrectAnswer() {
        const scene = this.currentScene();
        this.isRevealing = true;
        this.inputLocked = true;
        this.correctCount++;
        this.updateProgressBalls(this.correctCount);
        this.flashZones(COLORS.CORRECT);

        this.revealSkipCount(scene, () => {
            this.showCommutativity(scene, () => {
                if (this.correctCount >= this.requiredCorrect) {
                    this.delayedCall(scene, 500, () => {
                        this.finish(true, this.challengeData.product, scene.cameras.main.width / 2, GRID_CENTER_Y);
                    });
                } else {
                    this.delayedCall(scene, 600, () => this.restartChallenge(scene, { resetStreak: false }));
                }
            });
        });
    }

    handleWrongAnswer(playerAnswer) {
        const scene = this.currentScene();
        const { rows, cols, tens, ones } = this.challengeData;
        this.isRevealing = true;
        this.inputLocked = true;

        trackWrongAnswer('MultiplicationMode', `${rows}x${cols}`, String(playerAnswer));

        // Progress is kept — a miss on a brand new concept shouldn't wipe the
        // board. The child gets the same skip-count lesson, then the same
        // problem again (and once more a couple of rounds later). The coin
        // streak is reset when the board restarts, like in every other mode.
        this.queueRetry({ rows, cols });
        this.queueRetry({ rows, cols }, 2);

        this.flashZones(COLORS.WRONG);
        this.shakeZones(scene, () => {
            this.showCorrectDigits(tens, ones);
            // The skip-count is the lesson, so it runs on misses too; its last
            // number is the product, i.e. the spoken correct answer.
            this.revealAnswer(scene, {
                targets: this.getZones(),
                delay: this.skipCountDuration() + 1200
            });
            this.revealSkipCount(scene);
        });
    }

    // ---------------- Skip-count lesson ----------------

    skipCountStepMs() {
        return Math.min(700, Math.max(320, Math.round(2600 / this.challengeData.rows)));
    }

    skipCountDuration() {
        return this.challengeData.rows * this.skipCountStepMs() + 250;
    }

    // Light up one row at a time while the voice counts 10, 20, 30 — the
    // repeated addition behind the symbol.
    revealSkipCount(scene, onDone = null) {
        const { rows, cols, product } = this.challengeData;
        const stepMs = this.skipCountStepMs();

        for (let r = 0; r < rows; r++) {
            this.delayedCall(scene, r * stepMs, () => {
                const band = this.rowHighlights[r];
                if (band) band.setFillStyle(COLORS.CORRECT, 0.45);

                const total = (r + 1) * cols;
                const label = this.rowTotals[r];
                if (label) {
                    label.setText(`${total}`);
                    label.setAlpha(1);
                }

                const balls = this.gridItems.slice(r * cols, (r + 1) * cols);
                if (balls.length > 0) {
                    const baseScale = balls[0].scaleX;
                    this.addTween(scene, {
                        targets: balls,
                        scaleX: baseScale * 1.25,
                        scaleY: baseScale * 1.25,
                        duration: 140,
                        yoyo: true,
                        ease: 'Sine.easeInOut'
                    });
                }

                this.playAudio(scene, `number_audio_${total}`);
            });
        }

        this.delayedCall(scene, this.skipCountDuration(), () => {
            if (this.problemDisplay) this.problemDisplay.setText(`${rows} × ${cols} = ${product}`);
            if (onDone) onDone();
        });
    }

    // Transpose the array: same balls, rows and columns swapped, so 3 × 10 and
    // 10 × 3 are visibly the same amount.
    showCommutativity(scene, onDone) {
        const { rows, cols, product } = this.challengeData;

        if (!this.commutativityEnabled || rows === cols) {
            if (onDone) onDone();
            return;
        }

        const width = scene.cameras.main.width;
        const geo = this.gridGeometry(cols, rows, width);   // Swapped

        // The row bands and running totals belong to the old orientation
        [...this.rowHighlights, ...this.rowTotals].forEach(element => {
            this.addTween(scene, { targets: element, alpha: 0, duration: 250 });
        });

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const ball = this.gridItems[r * cols + c];
                if (!ball) continue;
                this.addTween(scene, {
                    targets: ball,
                    x: geo.startX + r * geo.cell,       // Old row becomes new column
                    y: geo.startY + c * geo.cell,       // Old column becomes new row
                    displayWidth: geo.cell * 0.78,
                    displayHeight: geo.cell * 0.78,
                    duration: 900,
                    delay: (r * cols + c) * 8,
                    ease: 'Cubic.easeInOut'
                });
            }
        }

        this.delayedCall(scene, 450, () => {
            if (this.problemDisplay) this.problemDisplay.setText(`${cols} × ${rows} = ${product}`);
        });

        this.delayedCall(scene, 1300, () => {
            if (onDone) onDone();
        });
    }

    // ---------------- Audio ----------------

    // "tre gånger tio" — stitched from the number audio plus the word "gånger".
    playProblemAudio(scene) {
        const { rows, cols } = this.challengeData;
        this.playSequence(scene, [`number_audio_${rows}`, 'math_audio_ganger', `number_audio_${cols}`]);
    }

    cleanup(scene) {
        super.cleanup(scene);
        this.gridItems = [];
        this.rowHighlights = [];
        this.rowTotals = [];
        this.problemDisplay = null;
    }
}
