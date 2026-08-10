import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { trackWrongAnswer } from '../wrongAnswers.js';

/**
 * Multiplication game mode
 * The problem is drawn as an array: `rows` rows of `cols` pokeballs, so the
 * answer can always be counted by hand. After every answer — right or wrong —
 * the rows light up one at a time while the voice skip-counts (10, 20, 30),
 * which is the bridge from counting to multiplication. On a correct answer the
 * array then transposes so `3 × 10` becomes `10 × 3` with the same balls,
 * showing commutativity instead of telling it.
 * Player answers by dragging digits into tens/ones slots, as in AdditionMode.
 */

// Layout constants for the 1280x900 canvas. The booster bar occupies y 35-85,
// so everything starts below it.
const PROBLEM_Y = 140;
const GRID_CENTER_Y = 320;
const GRID_BOX_WIDTH = 900;
const GRID_BOX_HEIGHT = 260;
const MAX_CELL = 72;
const DROP_ZONE_Y = 525;
const BALL_INDICATOR_Y = 615;
const DIGIT_START_Y = 690;

export class MultiplicationMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.correctCount = 0;
        this.requiredCorrect = 3;
        this.ballIndicators = [];

        // Drag-and-drop elements (same shape as AdditionMode)
        this.tensZone = null;
        this.onesZone = null;
        this.digitBoxes = [];
        this.isRevealing = false;

        // Array visualisation
        this.gridItems = [];        // Pokeball images, row-major (r * cols + c)
        this.rowHighlights = [];    // One faint band per row, greened during the reveal
        this.rowTotals = [];        // Running total per row, revealed one at a time
        this.problemDisplay = null;
        this.revealToken = 0;       // Invalidates pending delayed calls after cleanup

        // Audio
        this.activeAudio = [];
        this.audioToken = 0;        // Invalidates a stitched phrase that got superseded

        // Default settings (will be loaded from config)
        this.tables = [2, 5, 10];   // Group size = number of columns
        this.maxFactor = 10;        // Number of groups = number of rows
        this.maxProduct = 99;       // Two drop zones, so answers must stay below 100
        this.commutativityEnabled = true;
        this.configLoaded = false;
    }

    async loadConfig() {
        try {
            const response = await fetch('/config/minigames.json');
            if (response.ok) {
                const config = await response.json();
                if (config.multiplication) {
                    this.requiredCorrect = config.multiplication.required || this.requiredCorrect;
                    this.tables = this.parseNumberRange(config.multiplication.tables || '2,5,10');
                    this.maxFactor = config.multiplication.maxFactor || this.maxFactor;
                    this.maxProduct = config.multiplication.maxProduct || this.maxProduct;
                    this.commutativityEnabled = config.multiplication.showCommutativity !== false;
                }
            }
        } catch (error) {
            console.warn('Failed to load multiplication config, using defaults:', error);
        }
        this.configLoaded = true;
        console.log('MultiplicationMode loaded with settings:', {
            required: this.requiredCorrect,
            tables: this.tables,
            maxFactor: this.maxFactor,
            maxProduct: this.maxProduct,
            showCommutativity: this.commutativityEnabled
        });
    }

    parseNumberRange(input) {
        try {
            const parts = String(input).split(',');
            const numbers = new Set();

            for (const part of parts) {
                const trimmed = part.trim();
                if (trimmed.includes('-')) {
                    const [start, end] = trimmed.split('-').map(n => parseInt(n.trim()));
                    if (isNaN(start) || isNaN(end) || start > end || start < 1) {
                        continue; // Skip invalid
                    }
                    for (let i = start; i <= end; i++) {
                        numbers.add(i);
                    }
                } else {
                    const num = parseInt(trimmed);
                    if (isNaN(num) || num < 1) {
                        continue; // Skip invalid
                    }
                    numbers.add(num);
                }
            }

            const result = Array.from(numbers).sort((a, b) => a - b);
            return result.length > 0 ? result : [2, 5, 10]; // Fallback
        } catch (error) {
            console.warn('Failed to parse tables, using 2,5,10:', error);
            return [2, 5, 10];
        }
    }

    generateChallenge() {
        // Draw a table and a factor, retrying while the product needs three
        // digits (the answer only has a tens and a ones slot).
        let cols, rows, product;
        let attempts = 0;
        do {
            cols = this.tables[Phaser.Math.Between(0, this.tables.length - 1)];
            rows = Phaser.Math.Between(1, this.maxFactor);
            product = rows * cols;
            attempts++;
        } while (product > this.maxProduct && attempts < 50);

        // Safety net if the config makes every product too large.
        if (product > this.maxProduct) {
            cols = Math.min(...this.tables);
            rows = Math.max(1, Math.floor(this.maxProduct / cols));
            product = rows * cols;
        }

        this.challengeData = {
            rows: rows,          // Number of groups
            cols: cols,          // Group size — the table being practised
            product: product,
            tens: Math.floor(product / 10),
            ones: product % 10
        };

        return this.challengeData;
    }

    createChallengeUI(scene) {
        const width = scene.cameras.main.width;

        // The problem itself is the only prompt — no instructions.
        this.problemDisplay = scene.add.text(
            width / 2,
            PROBLEM_Y,
            `${this.challengeData.rows} × ${this.challengeData.cols}`,
            {
                font: 'bold 64px Arial',
                fill: '#2C3E50'
            }
        ).setOrigin(0.5);
        this.uiElements.push(this.problemDisplay);

        // Speaker button replays the spoken problem
        const speakerBtn = scene.add.text(width / 2 + 180, PROBLEM_Y, '🔊', {
            fontSize: '56px',
            padding: { y: 10 }
        }).setOrigin(0.5);
        speakerBtn.setInteractive({ useHandCursor: true });
        speakerBtn.on('pointerdown', () => this.playProblemAudio(scene));
        this.uiElements.push(speakerBtn);

        this.createGrid(scene);
        this.createDropZones(scene);
        this.createBallIndicators(scene);
        this.createDigitBoxes(scene);

        // Say the problem out loud as the round starts
        const token = this.revealToken;
        scene.time.delayedCall(250, () => {
            if (token !== this.revealToken) return;
            this.playProblemAudio(scene);
        });
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
                width / 2,
                y,
                geo.gridWidth + 20,
                geo.cell,
                0xFFFFFF,
                r % 2 === 0 ? 0.28 : 0.14
            );
            this.rowHighlights.push(band);
            this.uiElements.push(band);

            // Running total for this row, hidden until the reveal reaches it
            const total = scene.add.text(
                width / 2 + geo.gridWidth / 2 + 45,
                y,
                '',
                {
                    fontSize: '36px',
                    fontFamily: 'Arial',
                    color: '#7A5C00',
                    fontStyle: 'bold'
                }
            ).setOrigin(0, 0.5);
            total.setAlpha(0);
            this.rowTotals.push(total);
            this.uiElements.push(total);

            for (let c = 0; c < cols; c++) {
                const x = geo.startX + c * geo.cell;
                const ball = scene.add.image(x, y, 'pokeball_poke-ball-tiny');
                ball.setDisplaySize(geo.cell * 0.78, geo.cell * 0.78);
                this.gridItems.push(ball);
                this.uiElements.push(ball);
            }
        }
    }

    createDropZones(scene) {
        const width = scene.cameras.main.width;
        const dropZoneSize = 120;
        const dropZoneSpacing = 20;

        // Tens place (left)
        this.tensZone = scene.add.rectangle(
            width / 2 - dropZoneSize / 2 - dropZoneSpacing / 2,
            DROP_ZONE_Y,
            dropZoneSize,
            dropZoneSize,
            0xFFFFFF,
            0.2
        );
        this.tensZone.setStrokeStyle(4, 0x000000, 1);
        this.tensZone.setInteractive();
        this.tensZone.setData('value', null);
        this.tensZone.setData('place', 'tens');
        this.uiElements.push(this.tensZone);

        const tensLabel = scene.add.text(this.tensZone.x, this.tensZone.y, '', {
            fontSize: '72px',
            fontFamily: 'Arial',
            color: '#000000',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.tensZone.setData('label', tensLabel);
        this.uiElements.push(tensLabel);

        // Ones place (right)
        this.onesZone = scene.add.rectangle(
            width / 2 + dropZoneSize / 2 + dropZoneSpacing / 2,
            DROP_ZONE_Y,
            dropZoneSize,
            dropZoneSize,
            0xFFFFFF,
            0.2
        );
        this.onesZone.setStrokeStyle(4, 0x000000, 1);
        this.onesZone.setInteractive();
        this.onesZone.setData('value', null);
        this.onesZone.setData('place', 'ones');
        this.uiElements.push(this.onesZone);

        const onesLabel = scene.add.text(this.onesZone.x, this.onesZone.y, '', {
            fontSize: '72px',
            fontFamily: 'Arial',
            color: '#000000',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.onesZone.setData('label', onesLabel);
        this.uiElements.push(onesLabel);
    }

    createBallIndicators(scene) {
        const width = scene.cameras.main.width;
        const startX = width / 2 - ((this.requiredCorrect - 1) * 60) / 2;
        const y = BALL_INDICATOR_Y;
        const spacing = 60;

        this.ballIndicators = [];

        for (let i = 0; i < this.requiredCorrect; i++) {
            const x = startX + i * spacing;

            const circle = scene.add.circle(x, y, 20,
                i < this.correctCount ? 0x27AE60 : 0xffffff, 1);
            circle.setStrokeStyle(3, 0x000000);

            this.ballIndicators.push(circle);
            this.uiElements.push(circle);
        }

        // Add gift emoji at the end to show the goal
        const giftX = startX + this.requiredCorrect * spacing;
        const giftEmoji = scene.add.text(giftX, y, '🎁', {
            fontSize: '48px',
            padding: { y: 10 }
        }).setOrigin(0.5);
        this.uiElements.push(giftEmoji);
    }

    updateBallIndicators() {
        for (let i = 0; i < this.ballIndicators.length; i++) {
            this.ballIndicators[i].setFillStyle(i < this.correctCount ? 0x27AE60 : 0xffffff);
        }
    }

    createDigitBoxes(scene) {
        const width = scene.cameras.main.width;
        const boxSize = 80;
        const spacing = 20;
        const cols = 5;
        const startY = DIGIT_START_Y;
        const rowSpacing = 20;

        // Calculate starting X to center the grid
        const gridWidth = cols * boxSize + (cols - 1) * spacing;
        const startX = (width - gridWidth) / 2 + boxSize / 2;

        for (let digit = 0; digit <= 9; digit++) {
            const row = Math.floor(digit / cols);
            const col = digit % cols;
            const x = startX + col * (boxSize + spacing);
            const y = startY + row * (boxSize + rowSpacing);

            const box = scene.add.rectangle(x, y, boxSize, boxSize, 0xFFFFFF);
            box.setStrokeStyle(4, 0x3498DB);
            box.setInteractive({ useHandCursor: true });
            scene.input.setDraggable(box);
            box.setData('digit', digit);
            box.setData('originalX', x);
            box.setData('originalY', y);
            this.uiElements.push(box);

            const digitText = scene.add.text(x, y, digit.toString(), {
                fontSize: '48px',
                fontFamily: 'Arial',
                color: '#2C3E50',
                fontStyle: 'bold'
            }).setOrigin(0.5);
            box.setData('text', digitText);
            this.uiElements.push(digitText);

            this.digitBoxes.push({ box, digitText, digit });
        }

        // Set up drag and drop handlers
        scene.input.on('drag', (pointer, gameObject, dragX, dragY) => {
            if (this.isRevealing) return;

            gameObject.x = dragX;
            gameObject.y = dragY;

            const text = gameObject.getData('text');
            if (text) {
                text.x = dragX;
                text.y = dragY;
            }
        });

        scene.input.on('dragend', (pointer, gameObject) => {
            if (this.isRevealing) return;

            const digit = gameObject.getData('digit');

            if (Phaser.Geom.Intersects.RectangleToRectangle(gameObject.getBounds(), this.tensZone.getBounds())) {
                this.placeDigitInZone(gameObject, this.tensZone, digit);
            } else if (Phaser.Geom.Intersects.RectangleToRectangle(gameObject.getBounds(), this.onesZone.getBounds())) {
                this.placeDigitInZone(gameObject, this.onesZone, digit);
            } else {
                this.returnDigitToOriginal(gameObject);
            }

            this.checkAnswer();
        });
    }

    placeDigitInZone(digitBox, zone, digit) {
        // If zone already has a digit, return it to original position
        const currentDigit = zone.getData('occupyingBox');
        if (currentDigit) {
            this.returnDigitToOriginal(currentDigit);
        }

        digitBox.x = zone.x;
        digitBox.y = zone.y;
        const text = digitBox.getData('text');
        if (text) {
            text.x = zone.x;
            text.y = zone.y;
        }

        zone.setData('value', digit);
        zone.setData('occupyingBox', digitBox);

        const label = zone.getData('label');
        if (label) {
            label.setText(digit.toString());
        }
    }

    returnDigitToOriginal(digitBox) {
        const originalX = digitBox.getData('originalX');
        const originalY = digitBox.getData('originalY');

        digitBox.x = originalX;
        digitBox.y = originalY;

        const text = digitBox.getData('text');
        if (text) {
            text.x = originalX;
            text.y = originalY;
        }

        // Clear any zone that had this box
        if (this.tensZone && this.tensZone.getData('occupyingBox') === digitBox) {
            this.tensZone.setData('value', null);
            this.tensZone.setData('occupyingBox', null);
            this.tensZone.getData('label').setText('');
        }
        if (this.onesZone && this.onesZone.getData('occupyingBox') === digitBox) {
            this.onesZone.setData('value', null);
            this.onesZone.setData('occupyingBox', null);
            this.onesZone.getData('label').setText('');
        }
    }

    checkAnswer() {
        const tensValue = this.tensZone.getData('value');
        const onesValue = this.onesZone.getData('value');

        // Both zones must be filled
        if (tensValue === null || onesValue === null) {
            return;
        }

        const playerAnswer = tensValue * 10 + onesValue;

        if (playerAnswer === this.challengeData.product) {
            this.handleCorrectAnswer();
        } else {
            this.handleWrongAnswer(playerAnswer);
        }
    }

    // ---------------- Answer handling ----------------

    handleCorrectAnswer() {
        const scene = this.tensZone.scene;
        this.isRevealing = true;
        this.correctCount++;
        this.updateBallIndicators();

        // Flash zones green
        this.tensZone.setFillStyle(0x27AE60, 0.5);
        this.onesZone.setFillStyle(0x27AE60, 0.5);

        this.revealSkipCount(scene, () => {
            this.showCommutativity(scene, () => {
                if (this.correctCount >= this.requiredCorrect) {
                    scene.time.delayedCall(500, () => {
                        if (this.answerCallback) {
                            this.answerCallback(true, this.challengeData.product, scene.cameras.main.width / 2, GRID_CENTER_Y);
                        }
                    });
                } else {
                    scene.time.delayedCall(600, () => this.loadNextChallenge(scene));
                }
            });
        });
    }

    handleWrongAnswer(playerAnswer) {
        const scene = this.tensZone.scene;
        this.isRevealing = true;

        trackWrongAnswer('MultiplicationMode', `${this.challengeData.rows}x${this.challengeData.cols}`, String(playerAnswer));

        // Progress is kept — a miss on a brand new concept shouldn't wipe the
        // board. The child gets the same skip-count lesson and a new problem.
        this.tensZone.setFillStyle(0xFF0000, 0.5);
        this.onesZone.setFillStyle(0xFF0000, 0.5);

        const tensOriginalX = this.tensZone.x;
        const onesOriginalX = this.onesZone.x;

        scene.tweens.add({
            targets: [this.tensZone, this.tensZone.getData('label')],
            x: tensOriginalX - 10,
            duration: 50,
            yoyo: true,
            repeat: 3,
            onComplete: () => {
                this.tensZone.x = tensOriginalX;
                this.tensZone.getData('label').x = tensOriginalX;
            }
        });

        scene.tweens.add({
            targets: [this.onesZone, this.onesZone.getData('label')],
            x: onesOriginalX - 10,
            duration: 50,
            yoyo: true,
            repeat: 3,
            onComplete: () => {
                this.onesZone.x = onesOriginalX;
                this.onesZone.getData('label').x = onesOriginalX;

                this.showCorrectAnswer(scene);
            }
        });
    }

    showCorrectAnswer(scene) {
        // Return current digits, then place the correct ones
        this.tensZone.setFillStyle(0xFFFFFF, 0.2);
        this.onesZone.setFillStyle(0xFFFFFF, 0.2);

        const tensBox = this.tensZone.getData('occupyingBox');
        const onesBox = this.onesZone.getData('occupyingBox');
        if (tensBox) this.returnDigitToOriginal(tensBox);
        if (onesBox) this.returnDigitToOriginal(onesBox);

        const tensDigitBox = this.digitBoxes.find(d => d.digit === this.challengeData.tens);
        const onesDigitBox = this.digitBoxes.find(d => d.digit === this.challengeData.ones);
        if (tensDigitBox) this.placeDigitInZone(tensDigitBox.box, this.tensZone, this.challengeData.tens);
        if (onesDigitBox) this.placeDigitInZone(onesDigitBox.box, this.onesZone, this.challengeData.ones);

        // Gold = "this is the answer"
        this.tensZone.setFillStyle(0xFFD700, 0.5);
        this.onesZone.setFillStyle(0xFFD700, 0.5);

        // The skip-count is the lesson, so it runs on misses too
        this.revealSkipCount(scene, () => {
            scene.time.delayedCall(1200, () => this.loadNextChallenge(scene));
        });
    }

    // Light up one row at a time while the voice counts 10, 20, 30 — the
    // repeated addition behind the symbol.
    revealSkipCount(scene, onDone) {
        const { rows, cols } = this.challengeData;
        const token = this.revealToken;
        const stepMs = Math.min(700, Math.max(320, Math.round(2600 / rows)));

        for (let r = 0; r < rows; r++) {
            scene.time.delayedCall(r * stepMs, () => {
                if (token !== this.revealToken) return;

                const band = this.rowHighlights[r];
                if (band) band.setFillStyle(0x27AE60, 0.45);

                const total = (r + 1) * cols;
                const label = this.rowTotals[r];
                if (label) {
                    label.setText(`${total}`);
                    label.setAlpha(1);
                }

                const balls = this.gridItems.slice(r * cols, (r + 1) * cols);
                if (balls.length > 0) {
                    const baseScale = balls[0].scaleX;
                    scene.tweens.add({
                        targets: balls,
                        scaleX: baseScale * 1.25,
                        scaleY: baseScale * 1.25,
                        duration: 140,
                        yoyo: true,
                        ease: 'Sine.easeInOut'
                    });
                }

                this.playNumberAudio(scene, total);
            });
        }

        scene.time.delayedCall(rows * stepMs + 250, () => {
            if (token !== this.revealToken) return;
            if (this.problemDisplay) {
                this.problemDisplay.setText(`${rows} × ${cols} = ${this.challengeData.product}`);
            }
            if (onDone) onDone();
        });
    }

    // Transpose the array: same balls, rows and columns swapped, so 3 × 10 and
    // 10 × 3 are visibly the same amount.
    showCommutativity(scene, onDone) {
        const { rows, cols, product } = this.challengeData;
        const token = this.revealToken;

        if (!this.commutativityEnabled || rows === cols) {
            if (onDone) onDone();
            return;
        }

        const width = scene.cameras.main.width;
        const geo = this.gridGeometry(cols, rows, width);   // Swapped

        // The row bands and running totals belong to the old orientation
        [...this.rowHighlights, ...this.rowTotals].forEach(element => {
            scene.tweens.add({ targets: element, alpha: 0, duration: 250 });
        });

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const ball = this.gridItems[r * cols + c];
                if (!ball) continue;
                scene.tweens.add({
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

        scene.time.delayedCall(450, () => {
            if (token !== this.revealToken) return;
            if (this.problemDisplay) {
                this.problemDisplay.setText(`${cols} × ${rows} = ${product}`);
            }
        });

        scene.time.delayedCall(1300, () => {
            if (token !== this.revealToken) return;
            if (onDone) onDone();
        });
    }

    loadNextChallenge(scene) {
        this.isRevealing = false;
        this.cleanup(scene);
        this.generateChallenge();
        this.createChallengeUI(scene);
    }

    // ---------------- Audio ----------------

    addAudio(scene, key) {
        if (!scene.cache.audio.exists(key)) {
            console.warn(`Audio not found: ${key}`);
            return null;
        }
        const sound = scene.sound.add(key);
        this.activeAudio.push(sound);
        return sound;
    }

    stopAudio() {
        // Any queued step of a stitched phrase must not play() a destroyed sound
        this.audioToken++;
        this.activeAudio.forEach(sound => {
            if (sound.isPlaying) sound.stop();
            sound.destroy();
        });
        this.activeAudio = [];
    }

    playNumberAudio(scene, number) {
        this.stopAudio();
        const sound = this.addAudio(scene, `number_audio_${number}`);
        if (sound) sound.play();
    }

    // "tre gånger tio" — stitched from the number audio plus the word "gånger",
    // with the 50 ms gap that reads as natural speech.
    playProblemAudio(scene) {
        const { rows, cols } = this.challengeData;
        this.stopAudio();
        const token = this.audioToken;

        const first = this.addAudio(scene, `number_audio_${rows}`);
        const times = this.addAudio(scene, 'math_audio_ganger');
        const second = this.addAudio(scene, `number_audio_${cols}`);
        if (!first || !second) return;

        const gapMs = 50;
        first.play();

        scene.time.delayedCall(first.duration * 1000 + gapMs, () => {
            if (token !== this.audioToken) return;
            if (times) {
                times.play();
                scene.time.delayedCall(times.duration * 1000 + gapMs, () => {
                    if (token !== this.audioToken) return;
                    second.play();
                });
            } else {
                // No "gånger" audio available — still say both numbers
                second.play();
            }
        });
    }

    cleanup(scene) {
        // Invalidate any reveal steps still queued
        this.revealToken++;
        this.stopAudio();

        // Remove drag and drop listeners
        scene.input.off('drag');
        scene.input.off('dragend');

        this.uiElements.forEach(element => {
            if (element && element.destroy) {
                element.destroy();
            }
        });
        this.uiElements = [];
        this.digitBoxes = [];
        this.ballIndicators = [];
        this.gridItems = [];
        this.rowHighlights = [];
        this.rowTotals = [];
        this.problemDisplay = null;
        this.tensZone = null;
        this.onesZone = null;
        this.isRevealing = false;
    }
}
