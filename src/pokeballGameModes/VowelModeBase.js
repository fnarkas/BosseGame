import { BasePokeballGameMode, COLORS } from './BasePokeballGameMode.js';
import { wireButtonHover } from './uiKit.js';
import { trackWrongAnswer } from '../wrongAnswers.js';

/**
 * Shared machinery for the two vowel-length modes (VowelSoundsMode and
 * VowelLengthMode). Both show a 🔊 stimulus, two side-by-side answer cards
 * (long on the left, short on the right) with an optional listen badge, a row
 * of progress balls, and reveal the answer with the vowel visibly stretching
 * (long) or snapping together (short) while it is spoken.
 *
 * Subclasses provide:
 *   - `reveal(scene, onDone)`   the mode-specific reveal animation
 *   - `mistakeLabel()`          what to record as the missed item
 *   - `retryItem()`             what to re-ask after a miss
 *   - `finalAnswer()`           the answer reported with the reward
 *
 * The file name deliberately does not end in "Mode.js": the registry test
 * treats every *Mode.js in this folder as a playable mode.
 */

// Layout for the 1280x900 canvas. The booster bar occupies y 35-85.
export const STIMULUS_Y = 190;
export const WORD_Y = 350;
export const OPTION_Y = 530;
export const BALL_INDICATOR_Y = 690;

export const OPTION_WIDTH = 380;
export const OPTION_GAP = 80;

// Word rendering
export const LETTER_STEP = 76;      // Horizontal distance between letter centres
export const LETTER_FONT = 'bold 84px Arial';
export const VOWEL_STRETCH = 2.4;   // How wide a long vowel grows
export const VOWEL_SQUEEZE = 0.7;   // How narrow a short vowel is drawn
export const VOWEL_COLOR = '#00838F';
export const VOWEL_TINT = 0x00838F;
export const DIM_COLOR = '#B0BEC5';

const VOWEL_RE = /[aeiouyåäö]/;

export class VowelModeBase extends BasePokeballGameMode {
    constructor({ modeName, requiredCorrect, optionHeight }) {
        super();
        this.modeName = modeName;
        this.correctCount = 0;
        this.requiredCorrect = requiredCorrect;
        this.optionHeight = optionHeight;
        this.showListenHelp = true;
        this.configLoaded = false;
        this.hasError = false;

        this.optionButtons = [];   // { card, contents, text, x, y }
        this.letterObjects = [];   // { text, char, index, baseX, isVowel }
        this.wordElements = [];    // Everything belonging to the displayed word
    }

    // ---------------- Hooks for subclasses ----------------

    reveal(scene, onDone) { throw new Error('reveal must be implemented by subclass'); }
    mistakeLabel() { throw new Error('mistakeLabel must be implemented by subclass'); }
    retryItem() { return this.challengeData; }
    finalAnswer() { return this.challengeData.target; }

    // ---------------- Stimulus ----------------

    createSpeaker(scene, onPlay) {
        return this.createSpeakerButton(scene, scene.cameras.main.width / 2, STIMULUS_Y, onPlay, { fontSize: '90px' });
    }

    createLengthBar(scene, x, y, isLong, scale = 1) {
        return scene.add.rectangle(x, y, (isLong ? 200 : 56) * scale, 16 * scale, VOWEL_TINT, 0.9);
    }

    // ---------------- The word, drawn letter by letter ----------------

    // Letters are separate objects so the vowel can be animated on its own and
    // made tappable. `gapAfter` replaces the consonant with an empty slot.
    // `colorFor(index, isVowel)` picks each letter's colour; `interactiveVowel`
    // makes the vowel a button that plays just that sound (`onVowelTap`).
    renderWord(scene, word, {
        gapAfter = -1,
        vowelIndex = word.search(VOWEL_RE),
        colorFor = (index, isVowel) => (isVowel ? VOWEL_COLOR : COLORS.TEXT_DARK),
        interactiveVowel = false,
        onVowelTap = null
    } = {}) {
        this.destroyWord();

        const width = scene.cameras.main.width;
        const chars = word.split('');
        const slots = gapAfter >= 0 ? chars.length + 1 : chars.length;
        const startX = width / 2 - ((slots - 1) * LETTER_STEP) / 2;
        let slot = 0;

        const drawGap = () => {
            const gapBox = scene.add.rectangle(
                startX + slot * LETTER_STEP, WORD_Y, LETTER_STEP - 12, 96, COLORS.NEUTRAL_FILL, 0.35
            );
            gapBox.setStrokeStyle(4, VOWEL_TINT);
            this.wordElements.push(gapBox);
            this.uiElements.push(gapBox);
            slot++;
        };

        chars.forEach((char, index) => {
            if (gapAfter >= 0 && index === gapAfter + 1) drawGap();

            const x = startX + slot * LETTER_STEP;
            const isVowel = index === vowelIndex;

            const letter = scene.add.text(x, WORD_Y, char.toUpperCase(), {
                font: LETTER_FONT,
                fill: colorFor(index, isVowel)
            }).setOrigin(0.5);

            if (isVowel && interactiveVowel && onVowelTap) {
                letter.setInteractive({ useHandCursor: true });
                letter.on('pointerdown', onVowelTap);

                const underline = scene.add.rectangle(x, WORD_Y + 56, 52, 6, VOWEL_TINT, 0.8);
                this.wordElements.push(underline);
                this.uiElements.push(underline);
            }

            this.letterObjects.push({ text: letter, char, index: slot, baseX: x, isVowel });
            this.wordElements.push(letter);
            this.uiElements.push(letter);
            slot++;
        });

        // The gap sits at the very end when the consonant is word-final (gla[_])
        if (gapAfter >= 0 && gapAfter + 1 >= chars.length) drawGap();
    }

    destroyWord() {
        this.wordElements.forEach(element => {
            if (element && element.destroy) element.destroy();
            const i = this.uiElements.indexOf(element);
            if (i >= 0) this.uiElements.splice(i, 1);
        });
        this.wordElements = [];
        this.letterObjects = [];
    }

    // Show what the vowel does: a long vowel stretches wide and pushes the rest
    // of the word aside, a short one snaps together while the letters that
    // pass `swells` grow briefly. The length does not disappear - it moves.
    animateVowelLength(scene, isLong, { squeezeTo = VOWEL_SQUEEZE, swells = () => true } = {}) {
        const vowel = this.letterObjects.find(l => l.isVowel);
        if (!vowel) return false;
        const followers = this.letterObjects.filter(l => l.index > vowel.index);

        if (isLong) {
            const delta = (VOWEL_STRETCH - 1) * LETTER_STEP * 0.6;
            this.addTween(scene, {
                targets: vowel.text,
                scaleX: VOWEL_STRETCH,
                x: vowel.baseX + delta / 2,
                duration: 600,
                ease: 'Sine.easeOut'
            });
            followers.forEach(l => this.addTween(scene, {
                targets: l.text,
                x: l.baseX + delta,
                duration: 600,
                ease: 'Sine.easeOut'
            }));
        } else {
            this.addTween(scene, {
                targets: vowel.text,
                scaleX: squeezeTo,
                duration: 180,
                yoyo: true,
                repeat: 1,
                ease: 'Quad.easeOut'
            });
            followers.filter(swells).forEach(l => this.addTween(scene, {
                targets: l.text,
                scaleX: 1.25,
                scaleY: 1.25,
                duration: 300,
                yoyo: true,
                ease: 'Sine.easeInOut'
            }));
        }
        return true;
    }

    // ---------------- Answer options ----------------

    // Two cards, side by side. The card body selects; the small speaker badge in
    // the corner only listens, so the child can compare before committing.
    // `decorate(x, y)` returns the game objects drawn on the card.
    createOptionCard(scene, index, { decorate, onSelect, onListen }) {
        const width = scene.cameras.main.width;
        const totalWidth = OPTION_WIDTH * 2 + OPTION_GAP;
        const x = width / 2 - totalWidth / 2 + OPTION_WIDTH / 2 + index * (OPTION_WIDTH + OPTION_GAP);

        const card = scene.add.rectangle(x, OPTION_Y, OPTION_WIDTH, this.optionHeight, COLORS.NEUTRAL_FILL);
        card.setStrokeStyle(4, COLORS.NEUTRAL_STROKE);
        card.setInteractive({ useHandCursor: true });
        this.uiElements.push(card);

        const contents = decorate(x, OPTION_Y);
        this.uiElements.push(...contents);

        wireButtonHover(card, () => this.isInputBlocked());
        card.on('pointerdown', () => {
            if (this.isInputBlocked()) return;
            onSelect();
        });

        if (onListen && this.showListenHelp) {
            const badge = scene.add.text(
                x + OPTION_WIDTH / 2 - 34,
                OPTION_Y - this.optionHeight / 2 + 30,
                '🔊',
                { fontSize: '40px', padding: { y: 10 } }
            ).setOrigin(0.5).setInteractive({ useHandCursor: true });

            badge.on('pointerdown', () => {
                badge.setScale(0.9);
                this.delayedCall(scene, 100, () => { if (badge.scene) badge.setScale(1.0); });
                onListen();
            });
            this.uiElements.push(badge);
        }

        this.optionButtons.push({ card, contents, text: contents[0], x, y: OPTION_Y });
        return card;
    }

    // Plain text label card (spellings, ✅/❌, consonant clusters).
    createTextCard(scene, index, label, { fontSize, onSelect, onListen }) {
        return this.createOptionCard(scene, index, {
            decorate: (x, y) => [
                scene.add.text(x, y, label, {
                    fontSize,
                    fontFamily: 'Arial',
                    color: COLORS.TEXT_DARK,
                    fontStyle: 'bold',
                    padding: { y: 10 }
                }).setOrigin(0.5)
            ],
            onSelect,
            onListen
        });
    }

    paintCard(card, color) {
        if (!card || !card.scene) return;
        card.setFillStyle(color, 0.5);
        card.setStrokeStyle(6, color);
    }

    // ---------------- Progress ----------------

    createBallIndicators(scene) {
        this.createProgressBalls(scene, {
            total: this.requiredCorrect,
            completed: this.correctCount,
            y: BALL_INDICATOR_Y
        });
    }

    // ---------------- Answering ----------------

    handleAnswer(scene, isCorrect, answer, index) {
        if (this.isInputBlocked()) return;
        this.inputLocked = true;
        this.isRevealing = true;
        const chosen = this.optionButtons[index];

        if (isCorrect) {
            this.correctCount++;
            this.updateProgressBalls(this.correctCount);
            this.paintCard(chosen.card, COLORS.CORRECT);
            this.reveal(scene, () => this.advance(scene));
            return;
        }

        trackWrongAnswer(this.modeName, this.mistakeLabel(), String(answer));
        this.hasError = true;
        // The same question comes straight back, and once more a little later.
        const item = this.retryItem();
        this.queueRetry(item);
        this.queueRetry(item, 2);

        // The label shakes along with its card.
        const contents = chosen.contents.map(obj => ({ obj, x: obj.x }));
        this.addTween(scene, {
            targets: chosen.contents,
            x: '-=10',
            duration: 50,
            yoyo: true,
            repeat: 3,
            onComplete: () => contents.forEach(({ obj, x }) => { if (obj.scene) obj.x = x; })
        });
        this.shakeWrong(scene, chosen.card, {
            // The reveal runs on a miss too - the error is the lesson.
            // Progress is kept.
            onComplete: () => this.reveal(scene, () => this.advance(scene))
        });
    }

    advance(scene) {
        if (this.correctCount >= this.requiredCorrect) {
            this.delayedCall(scene, 500, () => {
                this.finish(true, this.finalAnswer(), scene.cameras.main.width / 2, WORD_Y);
            });
        } else {
            // The streak is only reset if this question was missed.
            this.delayedCall(scene, 700, () => this.restartChallenge(scene, { resetStreak: this.hasError === true }));
        }
    }

    disableCards() {
        this.optionButtons.forEach(({ card }) => { if (card.scene) card.disableInteractive(); });
    }

    // ---------------- Audio ----------------

    // One player for everything: the child will tap back and forth between
    // long and short, and overlapping playback hides exactly the difference
    // they are supposed to hear.
    playWord(scene, word) {
        this.playAudio(scene, wordKey(word));
    }

    playVowel(scene, vowel, isLong) {
        this.playAudio(scene, vowelKey(vowel, isLong));
    }

    cleanup(scene) {
        super.cleanup(scene);
        this.optionButtons = [];
        this.letterObjects = [];
        this.wordElements = [];
    }
}

export function wordKey(word) {
    return `word_audio_${word.toLowerCase()}`;
}

export function vowelKey(vowel, isLong) {
    return `vowel_audio_${vowel}_${isLong ? 'long' : 'short'}`;
}
