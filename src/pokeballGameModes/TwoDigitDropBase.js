import Phaser from 'phaser';
import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { COLORS } from './uiKit.js';

/**
 * Shared answer engine for the arithmetic modes (AdditionMode,
 * MultiplicationMode): a tens and a ones drop zone, ten draggable digit boxes,
 * and the standard feedback choreography.
 *
 * Subclasses provide the stimulus (the problem shown above the zones), the
 * vertical layout, `getCorrectAnswer()` and `handleCorrectAnswer(answer)` /
 * `handleWrongAnswer(answer)`. Everything about dragging digits into the two
 * slots, swapping a digit already in a slot, snapping boxes home, the red
 * shake and the gold reveal of the correct digits lives here.
 *
 * Not a mode itself: the registry only lists concrete modes, so the file name
 * deliberately does not end in "Mode.js".
 */

const DROP_ZONE_SIZE = 120;
const DROP_ZONE_SPACING = 20;
const DROP_ZONE_ALPHA = 0.2;
const BOX_SIZE = 80;
const BOX_SPACING = 20;
const BOX_COLS = 5;

export class TwoDigitDropBase extends BasePokeballGameMode {
    constructor() {
        super();
        this.tensZone = null;
        this.onesZone = null;
        this.digitBoxes = [];        // { box, digitText, digit }
        this.dragHandler = null;
        this.dragEndHandler = null;
    }

    // Subclasses must implement these three.
    getCorrectAnswer() { throw new Error('getCorrectAnswer must be implemented by subclass'); }
    handleCorrectAnswer(answer) { throw new Error('handleCorrectAnswer must be implemented by subclass'); }
    handleWrongAnswer(answer) { throw new Error('handleWrongAnswer must be implemented by subclass'); }

    // The scene the current UI lives in (set by createDropZones).
    currentScene() {
        return this.tensZone ? this.tensZone.scene : null;
    }

    // ---------------- Building the answer UI ----------------

    createDropZones(scene, y) {
        const width = scene.cameras.main.width;
        const makeZone = (x, place) => {
            const zone = scene.add.rectangle(x, y, DROP_ZONE_SIZE, DROP_ZONE_SIZE, COLORS.NEUTRAL_FILL, DROP_ZONE_ALPHA);
            zone.setStrokeStyle(4, COLORS.OUTLINE, 1);
            zone.setInteractive();
            zone.setData('value', null);
            zone.setData('place', place);
            zone.setData('occupyingBox', null);
            this.uiElements.push(zone);

            const label = scene.add.text(x, y, '', {
                fontSize: '72px',
                fontFamily: 'Arial',
                color: '#000000',
                fontStyle: 'bold'
            }).setOrigin(0.5);
            zone.setData('label', label);
            this.uiElements.push(label);
            return zone;
        };

        this.tensZone = makeZone(width / 2 - DROP_ZONE_SIZE / 2 - DROP_ZONE_SPACING / 2, 'tens');
        this.onesZone = makeZone(width / 2 + DROP_ZONE_SIZE / 2 + DROP_ZONE_SPACING / 2, 'ones');
    }

    getZones() {
        return [this.tensZone, this.onesZone].filter(Boolean);
    }

    // Digits 0-9 in two rows of five, draggable into the zones.
    createDigitBoxes(scene, startY) {
        const width = scene.cameras.main.width;
        const gridWidth = BOX_COLS * BOX_SIZE + (BOX_COLS - 1) * BOX_SPACING;
        const startX = (width - gridWidth) / 2 + BOX_SIZE / 2;

        this.digitBoxes = [];
        for (let digit = 0; digit <= 9; digit++) {
            const row = Math.floor(digit / BOX_COLS);
            const col = digit % BOX_COLS;
            const x = startX + col * (BOX_SIZE + BOX_SPACING);
            const y = startY + row * (BOX_SIZE + BOX_SPACING);

            const box = scene.add.rectangle(x, y, BOX_SIZE, BOX_SIZE, COLORS.NEUTRAL_FILL);
            box.setStrokeStyle(4, COLORS.NEUTRAL_STROKE);
            box.setInteractive({ useHandCursor: true });
            scene.input.setDraggable(box);
            box.setData('digit', digit);
            box.setData('originalX', x);
            box.setData('originalY', y);
            this.uiElements.push(box);

            const digitText = scene.add.text(x, y, digit.toString(), {
                fontSize: '48px',
                fontFamily: 'Arial',
                color: COLORS.TEXT_DARK,
                fontStyle: 'bold'
            }).setOrigin(0.5);
            box.setData('text', digitText);
            this.uiElements.push(digitText);

            this.digitBoxes.push({ box, digitText, digit });
        }

        // Scene-level listeners, kept as named handlers so cleanup() removes
        // only ours and not other listeners on the scene input.
        this.dragHandler = (pointer, gameObject, dragX, dragY) => {
            if (this.isInputBlocked() || !this.isDigitBox(gameObject)) return;
            gameObject.x = dragX;
            gameObject.y = dragY;
            const text = gameObject.getData('text');
            if (text) {
                text.x = dragX;
                text.y = dragY;
            }
        };

        this.dragEndHandler = (pointer, gameObject) => {
            if (this.isInputBlocked() || !this.isDigitBox(gameObject)) return;
            const digit = gameObject.getData('digit');
            const bounds = gameObject.getBounds();
            if (Phaser.Geom.Intersects.RectangleToRectangle(bounds, this.tensZone.getBounds())) {
                this.placeDigitInZone(gameObject, this.tensZone, digit);
            } else if (Phaser.Geom.Intersects.RectangleToRectangle(bounds, this.onesZone.getBounds())) {
                this.placeDigitInZone(gameObject, this.onesZone, digit);
            } else {
                this.returnDigitToOriginal(gameObject);
            }
            this.checkAnswer();
        };

        scene.input.on('drag', this.dragHandler);
        scene.input.on('dragend', this.dragEndHandler);
    }

    isDigitBox(gameObject) {
        return this.digitBoxes.some(d => d.box === gameObject);
    }

    boxForDigit(digit) {
        const entry = this.digitBoxes.find(d => d.digit === digit);
        return entry ? entry.box : null;
    }

    placeDigitInZone(digitBox, zone, digit) {
        // A digit already sitting in the zone goes home first
        const current = zone.getData('occupyingBox');
        if (current && current !== digitBox) this.returnDigitToOriginal(current);

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
        if (label) label.setText(digit.toString());
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

        // Clear whichever zone held this box
        this.getZones().forEach(zone => {
            if (zone.getData('occupyingBox') === digitBox) {
                zone.setData('value', null);
                zone.setData('occupyingBox', null);
                zone.getData('label').setText('');
            }
        });
    }

    // The two-digit number in the zones, or null until both are filled.
    getPlayerAnswer() {
        const tens = this.tensZone.getData('value');
        const ones = this.onesZone.getData('value');
        if (tens === null || ones === null) return null;
        return tens * 10 + ones;
    }

    checkAnswer() {
        if (this.isInputBlocked()) return;
        const answer = this.getPlayerAnswer();
        if (answer === null) return;
        if (answer === this.getCorrectAnswer()) this.handleCorrectAnswer(answer);
        else this.handleWrongAnswer(answer);
    }

    // ---------------- Feedback ----------------

    flashZones(color, alpha = 0.5) {
        this.getZones().forEach(zone => zone.setFillStyle(color, alpha));
    }

    // Red shake on both zones (and their labels), x restored, then `onComplete`.
    shakeZones(scene, onComplete) {
        const zones = this.getZones();
        zones.forEach((zone, index) => {
            this.shakeWrong(scene, zone.getData('label'), { restore: false });
            this.shakeWrong(scene, zone, {
                restore: false,
                onComplete: index === zones.length - 1 ? onComplete : null
            });
        });
    }

    // Send the wrong digits home and put the correct tens/ones digits in the
    // zones, painted gold. The reveal itself (lock, pulse, spoken answer,
    // continuation) is `revealAnswer()`, which callers chain after this.
    showCorrectDigits(tens, ones) {
        this.flashZones(COLORS.NEUTRAL_FILL, DROP_ZONE_ALPHA);
        this.getZones().forEach(zone => {
            const box = zone.getData('occupyingBox');
            if (box) this.returnDigitToOriginal(box);
        });
        const tensBox = this.boxForDigit(tens);
        const onesBox = this.boxForDigit(ones);
        if (tensBox) this.placeDigitInZone(tensBox, this.tensZone, tens);
        if (onesBox) this.placeDigitInZone(onesBox, this.onesZone, ones);
        this.flashZones(COLORS.REVEAL);
    }

    // ---------------- Teardown ----------------

    cleanup(scene) {
        if (this.dragHandler) scene.input.off('drag', this.dragHandler);
        if (this.dragEndHandler) scene.input.off('dragend', this.dragEndHandler);
        this.dragHandler = null;
        this.dragEndHandler = null;

        super.cleanup(scene);
        this.digitBoxes = [];
        this.tensZone = null;
        this.onesZone = null;
    }
}
