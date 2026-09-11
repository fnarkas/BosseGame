import {
    VowelModeBase, WORD_Y, LETTER_FONT, VOWEL_STRETCH, VOWEL_SQUEEZE, VOWEL_COLOR, VOWEL_TINT, DIM_COLOR,
    wordKey, vowelKey
} from './VowelModeBase.js';
import { COLORS } from './uiKit.js';
import { VOWEL_PAIRS, firstVowelOf } from '../vowelLengthPairs.js';
import { splitPair } from './VowelLengthMode.js';
import { loadModeConfig } from '../minigameConfig.js';

/**
 * Vowel sounds game mode - the two steps that come BEFORE VowelLengthMode.
 *
 * VowelLengthMode asks the child to hear a whole word and decide how it is
 * spelled. That presumes two things that have to be learned first:
 *
 *   1. SOUNDS:  hearing a vowel on its own and knowing whether it was
 *               "lååång" or "kort".                      🔊 → ▬▬▬ / ▪
 *   2. LETTERS: knowing that a long vowel is followed by ONE consonant and a
 *               short vowel by TWO.                      ▬▬▬ / ▪ → T / TT
 *
 * This mode drills exactly those two steps and nothing else. Which step is
 * played is chosen in the admin panel (stage: sounds / letters / mixed), so a
 * parent can move the child on once step 1 is solid.
 *
 * The visual language is the one the reveal in VowelLengthMode already uses:
 * a long vowel is drawn stretched wide over a long bar, a short one narrow over
 * a short bar. Long is always the LEFT card and short the RIGHT card, so the
 * position itself becomes a cue the child can lean on across both steps.
 */

const VOWELS = ['a', 'e', 'i', 'o', 'u', 'y', 'å', 'ä', 'ö'];

export const STAGE_SOUNDS = 'sounds';
export const STAGE_LETTERS = 'letters';
export const STAGE_MIXED = 'mixed';
const STAGES = [STAGE_SOUNDS, STAGE_LETTERS, STAGE_MIXED];

const ROUND_SOUND = 0;
const ROUND_LETTERS = 1;

// Pairs where the short form is a plain doubling of the same consonant
// (mat/matt, vila/villa). Pairs like tak/tack are left out of the LETTERS step:
// "ck" is two letters but not the same one twice, and that is a later lesson.
const DOUBLING_PAIRS = VOWEL_PAIRS
    .map(pair => ({ pair, parts: splitPair(pair.long, pair.short) }))
    .filter(({ parts }) => parts.shortCluster === parts.longCluster + parts.longCluster);

export class VowelSoundsMode extends VowelModeBase {
    constructor() {
        super({ modeName: 'VowelSoundsMode', requiredCorrect: 4, optionHeight: 170 });
        this.stage = STAGE_SOUNDS;
        this.roundType = ROUND_SOUND;
    }

    async loadConfig() {
        const config = await loadModeConfig('vowelSounds', { required: 4, stage: STAGE_SOUNDS, showListenHelp: true });
        this.requiredCorrect = config.required || this.requiredCorrect;
        if (STAGES.includes(config.stage)) this.stage = config.stage;
        this.showListenHelp = config.showListenHelp;
        this.configLoaded = true;
        console.log('VowelSoundsMode loaded with settings:', {
            required: this.requiredCorrect,
            stage: this.stage,
            showListenHelp: this.showListenHelp
        });
    }

    generateChallenge() {
        // A missed question comes back exactly as it was asked, in its own
        // round type (a sound question can't be answered with consonants).
        const retry = this.takeRetry();
        if (retry) {
            this.roundType = retry.pair ? ROUND_LETTERS : ROUND_SOUND;
            this.challengeData = { ...retry };
            return this.challengeData;
        }

        if (this.stage === STAGE_SOUNDS) {
            this.roundType = ROUND_SOUND;
        } else if (this.stage === STAGE_LETTERS) {
            this.roundType = ROUND_LETTERS;
        } else {
            this.roundType = this.correctCount % 2 === 0 ? ROUND_SOUND : ROUND_LETTERS;
        }

        // Re-roll if the draw is identical to the previous question, so the
        // same sound or word never comes twice in a row.
        const previous = this.challengeData;
        for (let attempt = 0; attempt < 10; attempt++) {
            const targetIsLong = Phaser.Math.Between(0, 1) === 0;

            if (this.roundType === ROUND_SOUND) {
                const vowel = VOWELS[Phaser.Math.Between(0, VOWELS.length - 1)];
                this.challengeData = { vowel, targetIsLong, pair: null, parts: null, target: null };
            } else {
                const { pair, parts } = DOUBLING_PAIRS[Phaser.Math.Between(0, DOUBLING_PAIRS.length - 1)];
                this.challengeData = {
                    vowel: firstVowelOf(pair.long),
                    targetIsLong,
                    pair,
                    parts,
                    target: targetIsLong ? pair.long : pair.short
                };
            }

            const same = previous
                && previous.pair === this.challengeData.pair
                && previous.vowel === this.challengeData.vowel
                && previous.targetIsLong === this.challengeData.targetIsLong;
            if (!same) break;
        }

        return this.challengeData;
    }

    createChallengeUI(scene) {
        this.inputLocked = false;
        this.isRevealing = false;
        const { vowel, targetIsLong } = this.challengeData;

        // The speaker is the whole stimulus in step 1; in step 2 the length is
        // given by eye as well, and the task is purely to map it onto one or
        // two consonants.
        this.createSpeaker(scene, () => this.playVowel(scene, vowel, targetIsLong));
        if (this.roundType === ROUND_SOUND) {
            this.createLengthOptions(scene);
        } else {
            this.renderVowelStimulus(scene, vowel, targetIsLong);
            this.createConsonantOptions(scene);
        }

        this.delayedCall(scene, 300, () => this.playVowel(scene, vowel, targetIsLong));
        this.createBallIndicators(scene);
    }

    // ---------------- Stimulus ----------------

    // The vowel alone, already drawn at its length: wide over a long bar, or
    // narrow over a short bar. Tapping it replays the sound.
    renderVowelStimulus(scene, vowel, isLong) {
        this.destroyWord();
        const x = scene.cameras.main.width / 2;

        const letter = scene.add.text(x, WORD_Y, vowel.toUpperCase(), {
            font: LETTER_FONT,
            fill: VOWEL_COLOR
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        letter.setScale(isLong ? VOWEL_STRETCH : VOWEL_SQUEEZE, 1);
        letter.on('pointerdown', () => this.playVowel(scene, vowel, isLong));

        const bar = this.createLengthBar(scene, x, WORD_Y + 62, isLong, 1.4);

        this.wordElements.push(letter, bar);
        this.uiElements.push(letter, bar);
    }

    // ---------------- Answer options ----------------

    // Step 1 cards: the same vowel drawn long (left) and short (right).
    createLengthOptions(scene) {
        const { vowel, targetIsLong } = this.challengeData;

        [true, false].forEach((isLongCard, index) => {
            this.createOptionCard(scene, index, {
                decorate: (x, y) => {
                    const letter = scene.add.text(x, y - 18, vowel.toUpperCase(), {
                        font: 'bold 64px Arial',
                        fill: COLORS.TEXT_DARK
                    }).setOrigin(0.5);
                    letter.setScale(isLongCard ? VOWEL_STRETCH : VOWEL_SQUEEZE, 1);
                    const bar = this.createLengthBar(scene, x, y + 48, isLongCard);
                    return [letter, bar];
                },
                onSelect: () => this.handleAnswer(scene, isLongCard === targetIsLong, isLongCard ? 'long' : 'short', index),
                onListen: () => this.playVowel(scene, vowel, isLongCard)
            });
        });
    }

    // Step 2 cards: one consonant (left) or two (right).
    createConsonantOptions(scene) {
        const { parts, targetIsLong, vowel } = this.challengeData;

        [parts.longCluster, parts.shortCluster].forEach((cluster, index) => {
            const isLongForm = index === 0;
            this.createTextCard(scene, index, cluster.toUpperCase(), {
                fontSize: '72px',
                onSelect: () => this.handleAnswer(scene, isLongForm === targetIsLong, cluster, index),
                onListen: () => this.playVowel(scene, vowel, isLongForm)
            });
        });
    }

    // ---------------- Hooks ----------------

    mistakeLabel() {
        const { vowel, targetIsLong, target } = this.challengeData;
        return this.roundType === ROUND_SOUND ? `${vowel}_${targetIsLong ? 'long' : 'short'}` : target;
    }

    finalAnswer() {
        return this.challengeData.target || this.challengeData.vowel;
    }

    reveal(scene, onDone) {
        this.disableCards();

        // Light up the correct card so the eye lands on the right answer even
        // after a miss.
        const correct = this.optionButtons[this.challengeData.targetIsLong ? 0 : 1];
        if (correct) this.paintCard(correct.card, COLORS.CORRECT);

        if (this.roundType === ROUND_SOUND) {
            this.revealVowel(scene, onDone);
        } else {
            this.revealWord(scene, onDone);
        }
    }

    // Step 1: the vowel appears plain, then stretches or snaps while the sound
    // plays again - sound and picture arrive together.
    revealVowel(scene, onDone) {
        const { vowel, targetIsLong } = this.challengeData;
        this.destroyWord();

        const x = scene.cameras.main.width / 2;
        const letter = scene.add.text(x, WORD_Y, vowel.toUpperCase(), {
            font: LETTER_FONT,
            fill: VOWEL_COLOR
        }).setOrigin(0.5);
        const bar = scene.add.rectangle(x, WORD_Y + 62, 56, 16, VOWEL_TINT, 0.9);
        this.wordElements.push(letter, bar);
        this.uiElements.push(letter, bar);

        this.playVowel(scene, vowel, targetIsLong);

        if (targetIsLong) {
            this.addTween(scene, { targets: letter, scaleX: VOWEL_STRETCH, duration: 600, ease: 'Sine.easeOut' });
            // The bar grows from short to long (56px -> 280px) along with the letter
            this.addTween(scene, { targets: bar, scaleX: 5, duration: 600, ease: 'Sine.easeOut' });
        } else {
            this.addTween(scene, {
                targets: letter,
                scaleX: VOWEL_SQUEEZE,
                duration: 180,
                yoyo: true,
                repeat: 1,
                ease: 'Quad.easeOut',
                onComplete: () => { if (letter.scene) letter.setScale(VOWEL_SQUEEZE, 1); }
            });
        }

        this.delayedCall(scene, 1100, onDone);
    }

    // Step 2: the whole word is spelled out and read aloud. The consonant(s)
    // before the vowel are dimmed: they are not what the question was about.
    // After a miss the isolated vowel follows the word.
    revealWord(scene, onDone) {
        const { target, targetIsLong, parts, vowel } = this.challengeData;
        const vowelIndex = parts.stem.length - 1;
        const clusterLength = targetIsLong ? parts.longCluster.length : parts.shortCluster.length;
        const inCluster = (index) => index > vowelIndex && index <= vowelIndex + clusterLength;

        this.renderWord(scene, target, {
            vowelIndex,
            colorFor: (index, isVowel) => (isVowel ? VOWEL_COLOR : (inCluster(index) ? COLORS.TEXT_DARK : DIM_COLOR))
        });

        if (this.hasError) {
            this.playSequence(scene, [wordKey(target), vowelKey(vowel, targetIsLong)]);
        } else {
            this.playWord(scene, target);
        }

        this.animateVowelLength(scene, targetIsLong, { swells: (l) => inCluster(l.index) });
        this.delayedCall(scene, 1300, onDone);
    }

    checkAnswer(answer) {
        return answer === this.challengeData.targetIsLong;
    }
}
