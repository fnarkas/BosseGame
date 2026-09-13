import Phaser from 'phaser';
import { VowelModeBase, WORD_Y, OPTION_WIDTH, OPTION_GAP, VOWEL_COLOR, vowelKey } from './VowelModeBase.js';
import { COLORS, updateZoneHover } from './uiKit.js';
import { trackWrongAnswer } from '../wrongAnswers.js';
import { pickAdaptive } from '../adaptive.js';
import { loadModeConfig } from '../minigameConfig.js';

/**
 * Vowel sort game mode - only the link between a vowel SOUND and the words
 * "lång" / "kort". Nothing about spelling, consonants or stretched letters:
 * the length is written out, because this child can read a little.
 *
 * Stage "drag":    a few letter cards, the same vowel once long and once short
 *                  (2 cards = one vowel, 4 = two vowels, ...). Tapping a card
 *                  plays its sound; the child drags each card into the LÅNG or
 *                  KORT bucket. The two cards of a vowel can be compared.
 * Stage "buttons": one sound on its own, then two buttons, LÅNG and KORT. No
 *                  other sound to compare with: this shows the length is heard
 *                  on its own.
 * Stage "mixed":   alternates a drag board and a single-sound question.
 *
 * A wrong drop shakes the card back, lights the right bucket while the sound
 * plays again, and the board stays: the child sorts the card again. The
 * missed sound comes back in the next task and once more a little later.
 */

const VOWELS = ['a', 'e', 'i', 'o', 'u', 'y', 'å', 'ä', 'ö'];

export const STAGE_DRAG = 'drag';
export const STAGE_BUTTONS = 'buttons';
export const STAGE_MIXED = 'mixed';
const STAGES = [STAGE_DRAG, STAGE_BUTTONS, STAGE_MIXED];

export const ROUND_DRAG = 0;
export const ROUND_BUTTONS = 1;

export const LABEL_LONG = 'LÅNG';
export const LABEL_SHORT = 'KORT';
const lengthLabel = (isLong) => (isLong ? LABEL_LONG : LABEL_SHORT);

// Drag board layout (1280x900; the booster bar sits at y 35-85).
const CARD_Y = 300;
const CARD_SIZE = 150;
const CARD_STEP = 200;
const BUCKET_Y = 610;
const BUCKET_HEIGHT = 220;
const BUCKET_ALPHA = 0.35;
const BUCKET_STROKE = 0x3498DB;

export const MIN_LETTERS = 2;
export const MAX_LETTERS = 6;

// Letters per drag board: even (each vowel comes as a long/short pair), 2-6.
export function clampLetters(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return MIN_LETTERS;
    return Math.min(MAX_LETTERS, Math.max(MIN_LETTERS, n - (n % 2)));
}

export class VowelSortMode extends VowelModeBase {
    constructor() {
        super({ modeName: 'VowelSortMode', requiredCorrect: 3, optionHeight: 170 });
        this.stage = STAGE_DRAG;
        this.lettersPerRound = MIN_LETTERS;
        this.roundType = ROUND_DRAG;
        this.buckets = [];
        this.cards = [];       // { box, text, vowel, isLong }
        this.sortedCount = 0;
    }

    async loadConfig() {
        const config = await loadModeConfig('vowelSort', { stage: STAGE_DRAG, letters: MIN_LETTERS, required: 3 });
        if (STAGES.includes(config.stage)) this.stage = config.stage;
        this.lettersPerRound = clampLetters(config.letters);
        this.requiredCorrect = config.required || this.requiredCorrect;
        this.configLoaded = true;
        console.log('VowelSortMode loaded with settings:', {
            stage: this.stage, letters: this.lettersPerRound, required: this.requiredCorrect
        });
    }

    // ---------------- Challenge ----------------

    generateChallenge() {
        // A missed sound comes back: as the next single question, or as one of
        // the vowels on the next board.
        const retry = this.takeRetry();

        if (this.stage === STAGE_DRAG) this.roundType = ROUND_DRAG;
        else if (this.stage === STAGE_BUTTONS) this.roundType = ROUND_BUTTONS;
        else this.roundType = this.correctCount % 2 === 0 ? ROUND_DRAG : ROUND_BUTTONS;

        const previous = this.challengeData;
        if (this.roundType === ROUND_BUTTONS) {
            let vowel = retry ? retry.vowel : null;
            let targetIsLong = retry ? retry.isLong : Phaser.Math.Between(0, 1) === 0;
            if (!vowel) {
                // Never the exact same sound twice in a row.
                for (let attempt = 0; attempt < 10; attempt++) {
                    vowel = pickAdaptive(this.modeName, VOWELS);
                    targetIsLong = Phaser.Math.Between(0, 1) === 0;
                    if (!previous || previous.vowel !== vowel || previous.targetIsLong !== targetIsLong) break;
                }
            }
            this.challengeData = { vowel, targetIsLong, cards: null };
            return this.challengeData;
        }

        const pairs = this.lettersPerRound / 2;
        const vowels = [];
        if (retry) vowels.push(retry.vowel);
        while (vowels.length < pairs) {
            const remaining = VOWELS.filter(v => !vowels.includes(v));
            vowels.push(pickAdaptive(this.modeName, remaining));
        }
        const cards = Phaser.Utils.Array.Shuffle(vowels.flatMap(vowel => [
            { vowel, isLong: true },
            { vowel, isLong: false }
        ]));
        this.challengeData = { vowel: null, targetIsLong: null, vowels, cards };
        return this.challengeData;
    }

    createChallengeUI(scene) {
        this.inputLocked = false;
        this.isRevealing = false;
        this.sortedCount = 0;

        if (this.roundType === ROUND_BUTTONS) {
            const { vowel, targetIsLong } = this.challengeData;
            this.createSpeaker(scene, () => this.playVowel(scene, vowel, targetIsLong));
            this.createLengthButtons(scene);
            this.delayedCall(scene, 300, () => this.playVowel(scene, vowel, targetIsLong));
        } else {
            this.createBuckets(scene);
            this.createCards(scene);
        }

        this.createBallIndicators(scene);
    }

    // ---------------- Buttons stage ----------------

    // LÅNG on the left, KORT on the right. No listen badges: the point of this
    // stage is to hear the length without a comparison.
    createLengthButtons(scene) {
        const { targetIsLong } = this.challengeData;
        [true, false].forEach((isLong, index) => {
            this.createTextCard(scene, index, lengthLabel(isLong), {
                fontSize: '72px',
                onSelect: () => this.handleAnswer(scene, isLong === targetIsLong, lengthLabel(isLong), index)
            });
        });
    }

    // ---------------- Drag stage ----------------

    createBuckets(scene) {
        const width = scene.cameras.main.width;
        const totalWidth = OPTION_WIDTH * 2 + OPTION_GAP;
        this.buckets = [];

        [true, false].forEach((isLong, index) => {
            const x = width / 2 - totalWidth / 2 + OPTION_WIDTH / 2 + index * (OPTION_WIDTH + OPTION_GAP);
            const zone = scene.add.rectangle(x, BUCKET_Y, OPTION_WIDTH, BUCKET_HEIGHT, COLORS.NEUTRAL_FILL, BUCKET_ALPHA);
            zone.setStrokeStyle(4, BUCKET_STROKE);
            zone.setData('isLong', isLong);
            zone.setData('originalAlpha', BUCKET_ALPHA);
            zone.setData('slots', 0);

            const label = scene.add.text(x, BUCKET_Y - BUCKET_HEIGHT / 2 + 40, lengthLabel(isLong), {
                fontSize: '56px', fontFamily: 'Arial', color: COLORS.TEXT_DARK, fontStyle: 'bold', padding: { y: 6 }
            }).setOrigin(0.5);
            label.setData('bucketLabel', isLong);

            this.buckets.push(zone);
            this.uiElements.push(zone, label);
        });
    }

    createCards(scene) {
        const width = scene.cameras.main.width;
        const { cards } = this.challengeData;
        const startX = width / 2 - ((cards.length - 1) * CARD_STEP) / 2;
        this.cards = [];
        const boxes = [];

        cards.forEach((entry, index) => {
            const x = startX + index * CARD_STEP;
            const box = scene.add.rectangle(x, CARD_Y, CARD_SIZE, CARD_SIZE, COLORS.NEUTRAL_FILL, 0.9);
            box.setStrokeStyle(4, COLORS.NEUTRAL_STROKE);
            box.setInteractive({ useHandCursor: true, draggable: true });
            box.setData('vowel', entry.vowel);
            box.setData('isLong', entry.isLong);
            box.setData('startX', x);
            box.setData('startY', CARD_Y);

            const text = scene.add.text(x, CARD_Y, entry.vowel.toUpperCase(), {
                font: 'bold 84px Arial', fill: VOWEL_COLOR
            }).setOrigin(0.5);
            const badge = scene.add.text(x + CARD_SIZE / 2 - 28, CARD_Y - CARD_SIZE / 2 + 26, '🔊', {
                fontSize: '32px', padding: { y: 8 }
            }).setOrigin(0.5);
            box.setData('letterText', text);
            box.setData('badge', badge);

            const card = { box, text, badge, vowel: entry.vowel, isLong: entry.isLong, sorted: false };
            this.cards.push(card);
            boxes.push(box);
            this.uiElements.push(box, text, badge);

            // A tap (or the start of a drag) plays this card's sound.
            box.on('pointerdown', () => {
                if (this.isInputBlocked() || card.sorted) return;
                this.playVowel(scene, entry.vowel, entry.isLong);
            });
            box.on('drag', (pointer, dragX, dragY) => {
                if (this.isInputBlocked() || card.sorted) return;
                this.moveCard(card, dragX, dragY);
                updateZoneHover(this.buckets, pointer);
            });
            box.on('dragend', (pointer) => this.handleDrop(scene, card, pointer));
        });

        scene.input.setDraggable(boxes);
    }

    moveCard(card, x, y) {
        card.box.x = x;
        card.box.y = y;
        card.text.x = x;
        card.text.y = y;
        card.badge.x = x + CARD_SIZE / 2 - 28;
        card.badge.y = y - CARD_SIZE / 2 + 26;
    }

    resetBucketHover() {
        this.buckets.forEach(zone => {
            if (zone.scene) zone.setFillStyle(COLORS.NEUTRAL_FILL, BUCKET_ALPHA);
        });
    }

    bucketUnder(pointer) {
        return this.buckets.find(zone => {
            const b = zone.getBounds();
            return pointer.x >= b.x && pointer.x <= b.x + b.width && pointer.y >= b.y && pointer.y <= b.y + b.height;
        }) || null;
    }

    handleDrop(scene, card, pointer) {
        if (this.isInputBlocked() || card.sorted) return;
        this.resetBucketHover();
        const bucket = this.bucketUnder(pointer);

        if (!bucket) {
            this.returnCard(scene, card);
            return;
        }
        if (bucket.getData('isLong') === card.isLong) {
            this.sortCard(scene, card, bucket);
        } else {
            this.wrongDrop(scene, card, bucket);
        }
    }

    returnCard(scene, card, onComplete = null) {
        const { box, text, badge } = card;
        const startX = box.getData('startX');
        const startY = box.getData('startY');
        this.addTween(scene, {
            targets: [box, text],
            x: startX, y: startY, duration: 300, ease: 'Back.easeOut'
        });
        this.addTween(scene, {
            targets: badge,
            x: startX + CARD_SIZE / 2 - 28, y: startY - CARD_SIZE / 2 + 26, duration: 300, ease: 'Back.easeOut',
            onComplete
        });
    }

    // The card settles inside the bucket, small and green, and says its sound
    // once more. When the last card is in, the round is won.
    sortCard(scene, card, bucket) {
        card.sorted = true;
        this.sortedCount++;
        const slot = bucket.getData('slots');
        bucket.setData('slots', slot + 1);
        const perRow = 3;
        const targetX = bucket.x - 100 + (slot % perRow) * 100;
        const targetY = bucket.y + 30 + Math.floor(slot / perRow) * 70;

        card.box.disableInteractive();
        card.badge.setVisible(false);
        card.box.setStrokeStyle(4, COLORS.CORRECT);
        card.box.setFillStyle(COLORS.CORRECT, 0.2);
        card.text.setColor('#27AE60');
        this.addTween(scene, {
            targets: [card.box, card.text],
            x: targetX, y: targetY, scale: 0.55, duration: 250, ease: 'Back.easeOut'
        });
        this.playVowel(scene, card.vowel, card.isLong);

        if (this.sortedCount >= this.cards.length) {
            this.inputLocked = true;
            this.correctCount++;
            this.updateProgressBalls(this.correctCount);
            this.buckets.forEach(zone => {
                zone.setFillStyle(COLORS.CORRECT, 0.2);
                zone.setStrokeStyle(6, COLORS.CORRECT);
            });
            this.showSuccessParticles(scene, scene.cameras.main.width / 2, BUCKET_Y - BUCKET_HEIGHT / 2);
            this.delayedCall(scene, 900, () => this.advance(scene));
        }
    }

    // Wrong bucket: the card shakes red, slides back, and the right bucket
    // lights up while the sound plays again. The board stays so the child can
    // sort the card again; the miss is remembered for later.
    wrongDrop(scene, card, bucket) {
        const label = `${card.vowel}_${card.isLong ? 'long' : 'short'}`;
        trackWrongAnswer(this.modeName, label, lengthLabel(bucket.getData('isLong')));
        this.hasError = true;
        const item = { vowel: card.vowel, isLong: card.isLong };
        this.queueRetry(item);
        this.queueRetry(item, 2);

        this.inputLocked = true;
        this.isRevealing = true;
        card.text.setTint(COLORS.WRONG);
        this.addTween(scene, { targets: card.text, x: card.text.x - 10, duration: 50, yoyo: true, repeat: 3 });

        this.shakeWrong(scene, card.box, {
            restore: false,
            onComplete: () => {
                if (!card.box.scene) return;
                card.text.clearTint();
                card.box.setStrokeStyle(4, COLORS.NEUTRAL_STROKE);
                card.box.setFillStyle(COLORS.NEUTRAL_FILL, 0.9);
                this.returnCard(scene, card, () => {
                    const correct = this.buckets.find(zone => zone.getData('isLong') === card.isLong);
                    this.revealAnswer(scene, {
                        targets: correct ? [correct] : [],
                        audioKey: vowelKey(card.vowel, card.isLong),
                        restore: (zone) => {
                            zone.setFillStyle(COLORS.NEUTRAL_FILL, BUCKET_ALPHA);
                            zone.setStrokeStyle(4, BUCKET_STROKE);
                        },
                        onDone: () => {
                            this.inputLocked = false;
                            this.isRevealing = false;
                        }
                    });
                });
            }
        });
    }

    // ---------------- Hooks (buttons stage) ----------------

    mistakeLabel() {
        const { vowel, targetIsLong } = this.challengeData;
        return `${vowel}_${targetIsLong ? 'long' : 'short'}`;
    }

    retryItem() {
        const { vowel, targetIsLong } = this.challengeData;
        return { vowel, isLong: targetIsLong };
    }

    finalAnswer() {
        return this.challengeData.vowel || 'sorted';
    }

    // The letter appears with the length written under it while the sound
    // plays again. After a miss the right button is lit as well.
    reveal(scene, onDone) {
        const { vowel, targetIsLong } = this.challengeData;
        this.disableCards();
        const correct = this.optionButtons[targetIsLong ? 0 : 1];
        if (correct) this.paintCard(correct.card, COLORS.CORRECT);

        this.destroyWord();
        const x = scene.cameras.main.width / 2;
        const letter = scene.add.text(x, WORD_Y - 30, vowel.toUpperCase(), {
            font: 'bold 96px Arial', fill: VOWEL_COLOR
        }).setOrigin(0.5).setScale(0);
        const word = scene.add.text(x, WORD_Y + 62, lengthLabel(targetIsLong), {
            fontSize: '48px', fontFamily: 'Arial', color: '#27AE60', fontStyle: 'bold', padding: { y: 6 }
        }).setOrigin(0.5).setScale(0);
        this.wordElements.push(letter, word);
        this.uiElements.push(letter, word);
        this.addTween(scene, { targets: [letter, word], scale: 1, duration: 300, ease: 'Back.easeOut' });

        this.playVowel(scene, vowel, targetIsLong);
        this.delayedCall(scene, 1200, onDone);
    }

    cleanup(scene) {
        super.cleanup(scene);
        this.buckets = [];
        this.cards = [];
        this.sortedCount = 0;
    }
}
