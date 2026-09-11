import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { COLORS, updateZoneHover } from './uiKit.js';
import { trackWrongAnswer } from '../wrongAnswers.js';
import { showNumberProgressPopup } from './numberProgressPopup.js';
import { loadModeConfig } from '../minigameConfig.js';
import { parseNumberRange, range } from '../utils/parseNumberRange.js';
import { pickAdaptive, HARD_NUMBERS } from '../adaptive.js';
import { numberAudioKeys } from '../audio.js';

/**
 * Number Listening Mode - hear a number, build it from digits
 *
 * The number is spoken (stitched from hundreds + remainder above 99) and the
 * child drags digits 0-9 into one drop zone per place value. A miss shows the
 * right digits in gold while the number is spoken again, and the same number
 * comes back straight away and once more a couple of rounds later.
 */

const DEFAULT_CONFIG = { required: 1, numbers: '10-99' };
const DEFAULT_POOL = range(10, 99);

const SPEAKER_Y = 180;
const DROP_ZONE_Y = 320;
const DROP_ZONE_SIZE = 120;
const DROP_ZONE_SPACING = 20;
const DROP_ZONE_ALPHA = 0.2;
const BALLS_Y = 470;
const DIGIT_START_Y = 580;
const PLACES = ['thousands', 'hundreds', 'tens', 'ones'];

// Audio keys that say `number`: 0-99 have their own file, 100-1000 are stitched
// from the hundreds marker and the remainder ("två hundra" + "fyrtiofem").
export { numberAudioKeys };

export class NumberListeningMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.correctInRow = 0;

        // Default values (overridden by loadConfig)
        this.requiredCorrect = DEFAULT_CONFIG.required;
        this.availableNumbers = [];
        this.clearedNumbers = new Set(); // Numbers answered correctly this session

        this.currentNumber = null;
        this.lastNumber = null; // Avoid asking the same number twice in a row
        this.zones = [];        // One drop zone per place value, most significant first
        this.digitBoxes = [];   // 0-9 draggable boxes
        this.configLoaded = false;
    }

    async loadConfig() {
        const config = await loadModeConfig('numbers', DEFAULT_CONFIG);
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
            number = pickAdaptive('NumberListeningMode', pool, { seedList: HARD_NUMBERS });
        }
        this.currentNumber = number;
        this.lastNumber = number;

        this.challengeData = {
            number,
            thousands: Math.floor(number / 1000),
            hundreds: Math.floor((number % 1000) / 100),
            tens: Math.floor((number % 100) / 10),
            ones: number % 10
        };
        return this.challengeData;
    }

    createChallengeUI(scene) {
        const width = scene.cameras.main.width;

        // A fresh challenge always starts accepting input again.
        this.inputLocked = false;
        this.isRevealing = false;

        this.createSpeakerButton(scene, width / 2, SPEAKER_Y, () => this.playNumberAudio(scene));
        this.playNumberAudio(scene);

        this.createDropZones(scene);
        this.createMatrixIcon(scene, DROP_ZONE_Y);
        this.createProgressBalls(scene, { total: this.requiredCorrect, completed: this.correctInRow, y: BALLS_Y });
        this.createDigitBoxes(scene);
    }

    // One zone per digit of the current number (2, 3 or 4), centred as a row.
    createDropZones(scene) {
        const width = scene.cameras.main.width;
        const needsThousands = this.currentNumber >= 1000;
        const needsHundreds = this.currentNumber >= 100;
        const places = PLACES.slice(needsThousands ? 0 : (needsHundreds ? 1 : 2));

        const totalWidth = places.length * DROP_ZONE_SIZE + (places.length - 1) * DROP_ZONE_SPACING;
        let zoneX = (width - totalWidth) / 2 + DROP_ZONE_SIZE / 2;

        this.zones = places.map(place => {
            const zone = scene.add.rectangle(zoneX, DROP_ZONE_Y, DROP_ZONE_SIZE, DROP_ZONE_SIZE, COLORS.NEUTRAL_FILL, DROP_ZONE_ALPHA);
            zone.setStrokeStyle(4, COLORS.OUTLINE, 1);
            zone.setInteractive();
            zone.setData('value', null);
            zone.setData('place', place);
            zone.setData('originalAlpha', DROP_ZONE_ALPHA);
            this.uiElements.push(zone);

            const label = scene.add.text(zone.x, zone.y, '', {
                fontSize: '72px',
                fontFamily: 'Arial',
                color: '#000000',
                fontStyle: 'bold'
            }).setOrigin(0.5);
            zone.setData('label', label);
            this.uiElements.push(label);

            zoneX += DROP_ZONE_SIZE + DROP_ZONE_SPACING;
            return zone;
        });
    }

    get thousandsZone() { return this.zoneFor('thousands'); }
    get hundredsZone() { return this.zoneFor('hundreds'); }
    get tensZone() { return this.zoneFor('tens'); }
    get onesZone() { return this.zoneFor('ones'); }

    zoneFor(place) {
        return this.zones.find(zone => zone.getData('place') === place) || null;
    }

    getZones() {
        return this.zones;
    }

    createMatrixIcon(scene, dropZoneY) {
        const width = scene.cameras.main.width;

        // To the right of the drop zones (further out when there are three or more)
        const iconX = this.currentNumber >= 100 ? width / 2 + 260 : width / 2 + 180;
        const iconY = dropZoneY;
        const iconSize = 60;

        const iconBg = scene.add.rectangle(iconX, iconY, iconSize, iconSize, COLORS.NEUTRAL_STROKE, 0.8);
        iconBg.setStrokeStyle(3, COLORS.NEUTRAL_FILL);
        iconBg.setInteractive({ useHandCursor: true });
        iconBg.on('pointerdown', () => this.showMatrixPopup());
        this.uiElements.push(iconBg);

        // Mini 3x3 grid so the icon reads as "the number chart"
        const miniCellSize = 12;
        const miniGap = 4;
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

    createDigitBoxes(scene) {
        const width = scene.cameras.main.width;
        const boxSize = 80;
        const spacing = 20;
        const cols = 5;
        const rowSpacing = 20;

        const gridWidth = cols * boxSize + (cols - 1) * spacing;
        const startX = (width - gridWidth) / 2 + boxSize / 2;

        this.digitBoxes = [];
        for (let digit = 0; digit <= 9; digit++) {
            const row = Math.floor(digit / cols);
            const col = digit % cols;
            const x = startX + col * (boxSize + spacing);
            const y = DIGIT_START_Y + row * (boxSize + rowSpacing);

            const box = scene.add.rectangle(x, y, boxSize, boxSize, 0x4A90E2, 0.3);
            box.setStrokeStyle(3, 0x4A90E2);
            box.setInteractive({ useHandCursor: true, draggable: true });
            box.setData('digit', digit);
            box.setData('startX', x);
            box.setData('startY', y);
            this.digitBoxes.push(box);
            this.uiElements.push(box);

            const digitText = scene.add.text(x, y, digit.toString(), {
                fontSize: '56px',
                fontFamily: 'Arial',
                color: '#ffffff',
                fontStyle: 'bold'
            }).setOrigin(0.5);
            box.setData('text', digitText);
            this.uiElements.push(digitText);

            box.on('drag', (pointer, dragX, dragY) => {
                box.x = dragX;
                box.y = dragY;
                digitText.x = dragX;
                digitText.y = dragY;
                // No highlight while the answer is being resolved/revealed
                if (!this.isInputBlocked()) updateZoneHover(this.zones, pointer);
            });

            box.on('dragend', (pointer) => this.handleDrop(scene, box, pointer));
        }

        scene.input.setDraggable(this.digitBoxes);
    }

    handleDrop(scene, draggedBox, pointer) {
        const digit = draggedBox.getData('digit');
        const digitText = draggedBox.getData('text');

        // Boxes always snap home: digits are reusable
        this.addTween(scene, {
            targets: [draggedBox, digitText],
            x: draggedBox.getData('startX'),
            y: draggedBox.getData('startY'),
            duration: 200,
            ease: 'Back.easeOut'
        });

        // Drops are ignored while an answer is being resolved or revealed
        if (this.isInputBlocked()) return;

        // updateZoneHover both finds the zone under the pointer and clears the
        // hover highlight from the others
        const zone = updateZoneHover(this.zones, pointer);
        if (zone) {
            zone.setData('value', digit);
            zone.getData('label').setText(digit.toString());
            zone.setFillStyle(COLORS.NEUTRAL_FILL, DROP_ZONE_ALPHA);
        }

        const allFilled = this.zones.every(z => z.getData('value') !== null);
        if (allFilled) {
            this.inputLocked = true;
            this.checkAnswer(scene);
        }
    }

    checkAnswer(scene) {
        const playerNumber = this.zones.reduce((sum, zone) => sum * 10 + zone.getData('value'), 0);

        if (playerNumber === this.currentNumber) {
            this.showCorrectFeedback(scene);
            this.correctInRow++;
            this.clearedNumbers.add(this.currentNumber);
            this.updateProgressBalls(this.correctInRow);

            if (this.correctInRow >= this.requiredCorrect) {
                this.delayedCall(scene, 1000, () => {
                    this.finish(true, 'number-match', scene.cameras.main.width / 2, scene.cameras.main.height / 2);
                });
            } else {
                this.delayedCall(scene, 1000, () => this.restartChallenge(scene, { resetStreak: false }));
            }
        } else {
            trackWrongAnswer('NumberListeningMode', this.currentNumber.toString(), playerNumber.toString());

            this.correctInRow = 0;
            this.updateProgressBalls(0);

            // Same number straight away, and once more a couple of rounds later
            this.queueRetry(this.currentNumber);
            this.queueRetry(this.currentNumber, 2);

            this.showWrongFeedback(scene);
        }
    }

    showCorrectFeedback(scene) {
        this.zones.forEach(zone => zone.setFillStyle(COLORS.CORRECT, 0.5));
        this.showSuccessParticles(scene, scene.cameras.main.width / 2, DROP_ZONE_Y);
    }

    // Red shake on every zone, then the correct digits in gold while the
    // number is spoken, then the same number again.
    showWrongFeedback(scene) {
        this.isRevealing = true;
        const zones = this.zones;
        zones.forEach((zone, index) => {
            const label = zone.getData('label');
            const isLast = index === zones.length - 1;
            zone.setFillStyle(COLORS.WRONG, 0.5);
            this.shakeWrong(scene, label, { restore: false });
            this.shakeWrong(scene, zone, {
                restore: false,
                onComplete: isLast ? () => this.showCorrectAnswer(scene) : null
            });
        });
    }

    showCorrectAnswer(scene) {
        const targets = [];
        this.zones.forEach(zone => {
            const value = this.challengeData[zone.getData('place')];
            const label = zone.getData('label');
            zone.setData('value', value);
            label.setText(value.toString());
            label.setColor('#FFD700');
            targets.push(zone, label);
        });

        this.revealAnswer(scene, {
            targets,
            disable: this.digitBoxes,
            audioKeys: numberAudioKeys(this.currentNumber)
        });
    }

    playNumberAudio(scene) {
        const keys = numberAudioKeys(this.currentNumber);
        if (keys.length === 0) {
            console.warn(`No audio available for number: ${this.currentNumber}`);
            return;
        }
        this.playSequence(scene, keys);
    }

    cleanup(scene) {
        // Cancels pending timers/tweens, stops audio, destroys uiElements, unlocks input
        super.cleanup(scene);
        this.zones = [];
        this.digitBoxes = [];
    }
}
