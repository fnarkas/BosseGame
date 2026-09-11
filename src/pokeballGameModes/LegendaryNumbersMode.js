import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { COLORS, updateZoneHover } from './uiKit.js';
import { showNumberProgressPopup } from './numberProgressPopup.js';
import { saveActiveMinigame, clearActiveMinigame } from '../minigameSession.js';
import { loadModeConfig } from '../minigameConfig.js';
import { parseNumberRange, range } from '../utils/parseNumberRange.js';

/**
 * Legendary Numbers Mode
 * Player must correctly identify every configured number from 0-99 before
 * running out of hearts. A miss costs a heart, shows the right digits in gold
 * while the number is spoken, and the same number is asked again.
 * No coin streak: the whole run pays one treasure reward at the end.
 */

const DEFAULT_CONFIG = { coinReward: 200, maxErrors: 5, numbers: '0-99' };
const ALL_NUMBERS = range(0, 99);

const HEARTS_Y = 70;
const DROP_ZONE_Y = 200;
const DROP_ZONE_SIZE = 120;
const DROP_ZONE_SPACING = 40;
const DROP_ZONE_ALPHA = 0.2;

export class LegendaryNumbersMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.numbersRange = { min: 0, max: 99 }; // 0-99 = 100 numbers total
        this.activeNumbers = new Set(); // Numbers that are part of the challenge
        this.clearedNumbers = new Set();
        this.currentNumber = null;
        this.tensZone = null;
        this.onesZone = null;
        this.digitBoxes = [];
        this.numberMatrix = null;

        // Default config (loaded from server)
        this.config = { ...DEFAULT_CONFIG };
        this.configLoaded = false;
        this.errorsRemaining = DEFAULT_CONFIG.maxErrors;
    }

    async loadConfig() {
        const config = await loadModeConfig('legendaryNumbers', DEFAULT_CONFIG);
        this.config = {
            coinReward: config.coinReward >= 0 ? config.coinReward : DEFAULT_CONFIG.coinReward,
            maxErrors: config.maxErrors >= 1 ? config.maxErrors : DEFAULT_CONFIG.maxErrors,
            numbers: String(config.numbers || '').trim() || DEFAULT_CONFIG.numbers
        };

        // Always derive the playable set from the (possibly default) config, so a
        // missing section or an invalid list still yields a solvable challenge.
        this.errorsRemaining = this.config.maxErrors;
        const inRange = parseNumberRange(this.config.numbers, []).filter(n => n >= 0 && n <= 99);
        this.activeNumbers = new Set(inRange.length > 0 ? inRange : ALL_NUMBERS);
        this.configLoaded = true;
    }

    getTotalNumbers() {
        return this.activeNumbers.size;
    }

    generateChallenge() {
        // A missed number comes back first (unless it has been cleared since)
        let number = this.takeRetry();
        while (number !== undefined && this.clearedNumbers.has(number)) number = this.takeRetry();

        if (number === undefined) {
            const uncleared = [...this.activeNumbers].filter(n => !this.clearedNumbers.has(n));
            if (uncleared.length === 0) {
                // All active numbers cleared - shouldn't happen as completion is checked first
                number = [...this.activeNumbers][0] || 0;
            } else {
                number = uncleared[Math.floor(Math.random() * uncleared.length)];
            }
        }

        this.currentNumber = number;
        this.challengeData = {
            number,
            tens: Math.floor(number / 10),
            ones: number % 10
        };
        return this.challengeData;
    }

    createChallengeUI(scene) {
        const width = scene.cameras.main.width;
        const height = scene.cameras.main.height;

        // A fresh challenge always starts accepting input again.
        this.isRevealing = false;
        this.inputLocked = false;

        this.createHearts(scene, { max: this.config.maxErrors, remaining: this.errorsRemaining, y: HEARTS_Y });
        this.createDropZones(scene);
        this.updateDropZoneVisibility();
        this.createNumberMatrix(scene);
        this.createSpeakerButton(scene, width / 2 + 140, height / 2 + 20, () => this.playNumberAudio(scene), { fontSize: '48px' });
        this.createDigitBoxes(scene);

        this.playNumberAudio(scene);
    }

    createNumberMatrix(scene) {
        const width = scene.cameras.main.width;
        const height = scene.cameras.main.height;

        // Small 10x10 chart between the drop zones and the digit boxes
        const matrixX = width / 2;
        const matrixY = height / 2 + 20;
        const cellSize = 18;
        const cols = 10;
        const rows = 10;
        const matrixWidth = cols * cellSize;
        const matrixHeight = rows * cellSize;

        const matrixBg = scene.add.rectangle(matrixX, matrixY, matrixWidth + 12, matrixHeight + 12, COLORS.OUTLINE, 0.7);
        matrixBg.setOrigin(0.5);
        matrixBg.setInteractive({ useHandCursor: true });
        matrixBg.on('pointerdown', () => this.showMatrixPopup());
        this.uiElements.push(matrixBg);

        this.numberMatrix = [];
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const number = row * 10 + col;
                const x = matrixX - matrixWidth / 2 + col * cellSize + cellSize / 2;
                const y = matrixY - matrixHeight / 2 + row * cellSize + cellSize / 2;

                const isCleared = this.clearedNumbers.has(number);
                const isActive = this.activeNumbers.has(number);
                let cellColor, cellAlpha;
                if (isCleared) {
                    cellColor = COLORS.CORRECT; cellAlpha = 0.9;
                } else if (isActive) {
                    cellColor = 0x555555; cellAlpha = 0.9;
                } else {
                    cellColor = 0x0d0d0d; cellAlpha = 0.35;
                }

                const cell = scene.add.rectangle(x, y, cellSize - 3, cellSize - 3, cellColor, cellAlpha);
                cell.setInteractive({ useHandCursor: true });
                cell.on('pointerdown', () => this.showMatrixPopup());
                this.uiElements.push(cell);
                this.numberMatrix.push({ number, cell, isActive });
            }
        }
    }

    showMatrixPopup() {
        showNumberProgressPopup(
            this.clearedNumbers,
            this.numbersRange.min,
            this.numbersRange.max,
            undefined,
            this.activeNumbers
        );
    }

    updateNumberMatrix(clearedNumber) {
        const entry = this.numberMatrix && this.numberMatrix.find(e => e.number === clearedNumber);
        if (entry) entry.cell.setFillStyle(COLORS.CORRECT, 0.9);
    }

    createDropZones(scene) {
        const centerX = scene.cameras.main.width / 2;
        const makeZone = (x, place) => {
            const zone = scene.add.rectangle(x, DROP_ZONE_Y, DROP_ZONE_SIZE, DROP_ZONE_SIZE, COLORS.NEUTRAL_FILL, DROP_ZONE_ALPHA);
            zone.setStrokeStyle(4, COLORS.NEUTRAL_FILL, 1);
            zone.setData('digit', place);
            zone.setData('value', null);
            zone.setData('originalAlpha', DROP_ZONE_ALPHA);
            this.uiElements.push(zone);

            const label = scene.add.text(x, DROP_ZONE_Y, '', {
                fontSize: '72px',
                fontFamily: 'Arial',
                color: '#FFFFFF',
                fontStyle: 'bold'
            }).setOrigin(0.5);
            zone.setData('label', label);
            this.uiElements.push(label);
            return zone;
        };

        this.tensZone = makeZone(centerX - DROP_ZONE_SIZE / 2 - DROP_ZONE_SPACING / 2, 'tens');
        this.onesZone = makeZone(centerX + DROP_ZONE_SIZE / 2 + DROP_ZONE_SPACING / 2, 'ones');
    }

    getZones() {
        return [this.tensZone, this.onesZone].filter(Boolean);
    }

    isSingleDigit() {
        return this.currentNumber < 10;
    }

    updateDropZoneVisibility() {
        // For single-digit numbers (0-9), hide the tens zone
        const showTens = !this.isSingleDigit();
        this.tensZone.setVisible(showTens);
        this.tensZone.getData('label').setVisible(showTens);
        this.onesZone.setVisible(true);
        this.onesZone.getData('label').setVisible(true);
    }

    createDigitBoxes(scene) {
        const width = scene.cameras.main.width;
        const height = scene.cameras.main.height;
        const boxSize = 80;
        const spacing = 20;
        const cols = 5;
        const startY = height - 160;

        this.digitBoxes = [];
        for (let digit = 0; digit <= 9; digit++) {
            const row = Math.floor(digit / cols);
            const col = digit % cols;
            const x = width / 2 - (cols * (boxSize + spacing)) / 2 + col * (boxSize + spacing) + boxSize / 2;
            const y = startY + row * (boxSize + spacing);

            const box = scene.add.rectangle(x, y, boxSize, boxSize, COLORS.NEUTRAL_STROKE, 0.8);
            box.setStrokeStyle(3, COLORS.NEUTRAL_FILL);
            box.setInteractive({ useHandCursor: true, draggable: true });
            box.setData('digit', digit);
            box.setData('startX', x);
            box.setData('startY', y);
            this.digitBoxes.push(box);
            this.uiElements.push(box);

            const digitText = scene.add.text(x, y, digit.toString(), {
                fontSize: '48px',
                fontFamily: 'Arial',
                color: '#FFFFFF',
                fontStyle: 'bold'
            }).setOrigin(0.5);
            box.setData('text', digitText);
            this.uiElements.push(digitText);

            box.on('drag', (pointer, dragX, dragY) => {
                if (this.isInputBlocked()) return; // Frozen while feedback is shown
                box.x = dragX;
                box.y = dragY;
                digitText.x = dragX;
                digitText.y = dragY;
                updateZoneHover(this.getZones(), pointer);
            });

            box.on('dragend', (pointer) => this.handleDrop(scene, box, pointer));
        }

        scene.input.setDraggable(this.digitBoxes);
    }

    handleDrop(scene, box, pointer) {
        if (this.isInputBlocked()) return;

        const digit = box.getData('digit');

        // updateZoneHover both finds the zone under the pointer and clears the
        // hover highlight from the others. The hidden tens zone never accepts.
        const zone = updateZoneHover(this.getZones(), pointer);
        if (zone && !(zone === this.tensZone && this.isSingleDigit())) {
            zone.setData('value', digit);
            zone.getData('label').setText(digit.toString());
        }
        this.getZones().forEach(z => z.setFillStyle(COLORS.NEUTRAL_FILL, DROP_ZONE_ALPHA));

        // Boxes always snap home: digits are reusable
        this.addTween(scene, {
            targets: [box, box.getData('text')],
            x: box.getData('startX'),
            y: box.getData('startY'),
            duration: 200,
            ease: 'Back.easeOut'
        });

        const onesValue = this.onesZone.getData('value');
        const tensValue = this.tensZone.getData('value');
        const complete = this.isSingleDigit() ? onesValue !== null : (tensValue !== null && onesValue !== null);
        if (complete) this.checkAnswer(scene);
    }

    checkAnswer(scene) {
        if (this.isInputBlocked()) return;

        const onesValue = this.onesZone.getData('value');
        const guessedNumber = this.isSingleDigit()
            ? onesValue
            : this.tensZone.getData('value') * 10 + onesValue;

        if (guessedNumber === this.currentNumber) this.handleCorrectAnswer(scene);
        else this.handleWrongAnswer(scene, guessedNumber);
    }

    handleCorrectAnswer(scene) {
        this.isRevealing = true;
        this.inputLocked = true;

        this.clearedNumbers.add(this.currentNumber);
        this.updateNumberMatrix(this.currentNumber);
        this.getZones().forEach(zone => zone.setFillStyle(COLORS.CORRECT, 0.6));

        this.delayedCall(scene, 500, () => {
            if (this.clearedNumbers.size >= this.getTotalNumbers()) {
                this.handleCompletion(scene);
            } else {
                // Reset and continue with the next number on the same board
                this.resetZones();
                this.generateChallenge();
                this.updateDropZoneVisibility();
                this.playNumberAudio(scene);
                this.isRevealing = false;
                this.inputLocked = false;
            }
        });
    }

    handleWrongAnswer(scene, guessedNumber) {
        this.isRevealing = true;
        this.inputLocked = true;

        // Lose a heart
        this.errorsRemaining = Math.max(0, this.errorsRemaining - 1);
        this.updateHearts(this.errorsRemaining);

        // The same number comes straight back (and once more later on)
        this.queueRetry(this.currentNumber);
        this.queueRetry(this.currentNumber, 2);

        // Red shake, then the right digits in gold while the number is spoken.
        // No coin streak in this mode, so the restart never resets one.
        const zones = this.getZones();
        zones.forEach((zone, index) => {
            zone.setFillStyle(COLORS.WRONG, 0.6);
            this.shakeWrong(scene, zone.getData('label'), { restore: false });
            this.shakeWrong(scene, zone, {
                restore: false,
                onComplete: index === zones.length - 1 ? () => this.showCorrectAnswer(scene) : null
            });
        });
    }

    showCorrectAnswer(scene) {
        const { tens, ones } = this.challengeData;
        const targets = [];
        const reveal = (zone, value) => {
            zone.setData('value', value);
            zone.getData('label').setText(value.toString());
            zone.getData('label').setColor('#FFD700');
            targets.push(zone, zone.getData('label'));
        };
        if (!this.isSingleDigit()) reveal(this.tensZone, tens);
        reveal(this.onesZone, ones);

        this.revealAnswer(scene, {
            targets,
            disable: this.digitBoxes,
            audioKey: `number_audio_${this.currentNumber}`,
            delay: 1000,
            resetStreak: false,
            onDone: () => {
                if (this.errorsRemaining <= 0) this.handleGameOver(scene);
                else this.restartChallenge(scene, { resetStreak: false });
            }
        });
    }

    resetZones() {
        this.getZones().forEach(zone => {
            zone.setData('value', null);
            zone.getData('label').setText('');
            zone.getData('label').setColor('#FFFFFF');
            zone.setFillStyle(COLORS.NEUTRAL_FILL, DROP_ZONE_ALPHA);
        });
    }

    playNumberAudio(scene) {
        this.playAudio(scene, `number_audio_${this.currentNumber}`);
    }

    async handleGameOver(scene) {
        console.log('💔 Game Over - All hearts lost!');

        this.cleanup(scene);

        // Reset state for next time
        this.clearedNumbers.clear();
        this.retryQueue = [];
        this.errorsRemaining = this.config.maxErrors;

        // This game is finished — forget it so a reload doesn't resume it.
        clearActiveMinigame();

        // Force scene to switch to next mode. selectGameMode() is async (it
        // loads the wheel weights), so wait for it before wiring up the new
        // mode — otherwise the callback lands on this finished mode instead.
        scene.challengeCount++;
        await scene.selectGameMode();

        scene.gameMode.setAnswerCallback((isCorrect, answer, x, y) => {
            scene.handleAnswer(isCorrect, answer, x, y);
        });

        const forcedMode = scene.registry.get('pokeballGameMode');
        if (!forcedMode) {
            saveActiveMinigame(scene.gameMode.constructor.name);
            scene.showDiceRollAnimation();
        } else {
            // In forced debug mode there is no next mode: back to the main scene
            scene.scene.start('MainGameScene');
        }
    }

    handleCompletion(scene) {
        console.log(`🎁 Legendary Numbers complete! Reward: ${this.config.coinReward} coins`);

        // Return to main game - the standard reward animation handles it
        this.finish(true, 'legendary-numbers-complete', scene.cameras.main.width / 2, scene.cameras.main.height / 2);
    }

    cleanup(scene) {
        super.cleanup(scene);
        this.digitBoxes = [];
        this.tensZone = null;
        this.onesZone = null;
        this.numberMatrix = null;
    }
}

// Make debug method globally accessible
if (typeof window !== 'undefined') {
    window.completeLegendaryNumbers = function() {
        console.log('🐛 Looking for active legendary numbers game mode...');
        if (window.phaserGame && window.phaserGame.scene) {
            const scenes = window.phaserGame.scene.getScenes(true);
            const pokeballScene = scenes.find(s => s.scene.key === 'PokeballGameScene');
            if (pokeballScene && pokeballScene.gameMode && pokeballScene.gameMode.constructor.name === 'LegendaryNumbersMode') {
                for (let i = pokeballScene.gameMode.numbersRange.min; i <= pokeballScene.gameMode.numbersRange.max; i++) {
                    pokeballScene.gameMode.clearedNumbers.add(i);
                }
                pokeballScene.gameMode.handleCompletion(pokeballScene);
                console.log('✅ Legendary numbers challenge completed!');
            } else {
                console.log('❌ Legendary numbers game not found');
            }
        }
    };
}
