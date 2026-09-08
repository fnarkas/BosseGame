import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { VOWEL_PAIRS, firstVowelOf } from '../vowelLengthPairs.js';
import { splitPair } from './VowelLengthMode.js';
import { trackWrongAnswer } from '../wrongAnswers.js';

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

// Layout for the 1280x900 canvas. The booster bar occupies y 35-85.
const STIMULUS_Y = 190;
const WORD_Y = 350;
const OPTION_Y = 530;
const BALL_INDICATOR_Y = 690;

const OPTION_WIDTH = 380;
const OPTION_HEIGHT = 170;
const OPTION_GAP = 80;

const LETTER_STEP = 76;
const LETTER_FONT = 'bold 84px Arial';
const VOWEL_STRETCH = 2.4;   // How wide a long vowel grows
const VOWEL_SQUEEZE = 0.7;   // How narrow a short vowel is drawn

const VOWELS = ['a', 'e', 'i', 'o', 'u', 'y', 'å', 'ä', 'ö'];

export const STAGE_SOUNDS = 'sounds';
export const STAGE_LETTERS = 'letters';
export const STAGE_MIXED = 'mixed';

const ROUND_SOUND = 0;
const ROUND_LETTERS = 1;

// Pairs where the short form is a plain doubling of the same consonant
// (mat/matt, vila/villa). Pairs like tak/tack are left out of the LETTERS step:
// "ck" is two letters but not the same one twice, and that is a later lesson.
const DOUBLING_PAIRS = VOWEL_PAIRS
    .map(pair => ({ pair, parts: splitPair(pair.long, pair.short) }))
    .filter(({ parts }) => parts.shortCluster === parts.longCluster + parts.longCluster);

export class VowelSoundsMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.correctCount = 0;
        this.requiredCorrect = 4;
        this.stage = STAGE_SOUNDS;
        this.showListenHelp = true;
        this.configLoaded = false;
        this.roundType = ROUND_SOUND;

        this.optionButtons = [];
        this.letterObjects = [];   // { text, baseX, index, isVowel }
        this.wordElements = [];    // Everything belonging to the displayed word/vowel
        this.ballIndicators = [];
        this.isRevealing = false;
        this.currentAudio = null;
    }

    async loadConfig() {
        try {
            const response = await fetch('/config/minigames.json');
            if (response.ok) {
                const config = await response.json();
                if (config.vowelSounds) {
                    this.requiredCorrect = config.vowelSounds.required || this.requiredCorrect;
                    if ([STAGE_SOUNDS, STAGE_LETTERS, STAGE_MIXED].includes(config.vowelSounds.stage)) {
                        this.stage = config.vowelSounds.stage;
                    }
                    this.showListenHelp = config.vowelSounds.showListenHelp !== false;
                }
            }
        } catch (error) {
            console.warn('Failed to load vowel sounds config, using defaults:', error);
        }
        this.configLoaded = true;
        console.log('VowelSoundsMode loaded with settings:', {
            required: this.requiredCorrect,
            stage: this.stage,
            showListenHelp: this.showListenHelp
        });
    }

    generateChallenge() {
        if (this.stage === STAGE_SOUNDS) {
            this.roundType = ROUND_SOUND;
        } else if (this.stage === STAGE_LETTERS) {
            this.roundType = ROUND_LETTERS;
        } else {
            this.roundType = this.correctCount % 2 === 0 ? ROUND_SOUND : ROUND_LETTERS;
        }

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

        return this.challengeData;
    }

    createChallengeUI(scene) {
        const { vowel, targetIsLong } = this.challengeData;

        if (this.roundType === ROUND_SOUND) {
            // Step 1: only the ear. The speaker is the whole stimulus.
            this.createSpeaker(scene, STIMULUS_Y, () => this.playVowel(scene, vowel, targetIsLong));
            this.createLengthOptions(scene);
        } else {
            // Step 2: the length is given, both by eye and by ear. The task is
            // purely to map it onto one or two consonants.
            this.createSpeaker(scene, STIMULUS_Y, () => this.playVowel(scene, vowel, targetIsLong));
            this.renderVowelStimulus(scene, vowel, targetIsLong);
            this.createConsonantOptions(scene);
        }

        scene.time.delayedCall(300, () => this.playVowel(scene, vowel, targetIsLong));
        this.createBallIndicators(scene);
    }

    // ---------------- Stimulus ----------------

    createSpeaker(scene, y, onPlay) {
        const width = scene.cameras.main.width;
        const speaker = scene.add.text(width / 2, y, '🔊', {
            font: '90px Arial',
            padding: { y: 20 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        speaker.on('pointerover', () => speaker.setScale(1.1));
        speaker.on('pointerout', () => speaker.setScale(1.0));
        speaker.on('pointerdown', () => {
            speaker.setScale(0.9);
            scene.time.delayedCall(100, () => speaker.setScale(1.0));
            onPlay();
        });

        this.uiElements.push(speaker);
        return speaker;
    }

    // The vowel alone, already drawn at its length: wide over a long bar, or
    // narrow over a short bar. Tapping it replays the sound.
    renderVowelStimulus(scene, vowel, isLong) {
        this.destroyWord();
        const x = scene.cameras.main.width / 2;

        const letter = scene.add.text(x, WORD_Y, vowel.toUpperCase(), {
            font: LETTER_FONT,
            fill: '#00838F'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        letter.setScale(isLong ? VOWEL_STRETCH : VOWEL_SQUEEZE, 1);
        letter.on('pointerdown', () => this.playVowel(scene, vowel, isLong));

        const bar = this.createLengthBar(scene, x, WORD_Y + 62, isLong, 1.4);

        this.wordElements.push(letter, bar);
        this.uiElements.push(letter, bar);
    }

    createLengthBar(scene, x, y, isLong, scale = 1) {
        const bar = scene.add.rectangle(x, y, (isLong ? 200 : 56) * scale, 16 * scale, 0x00838F, 0.9);
        return bar;
    }

    // ---------------- Answer options ----------------

    // Two cards, side by side. The card body selects; the small speaker badge in
    // the corner only listens, so the child can compare before committing.
    createOptionCard(scene, index, { decorate, onSelect, onListen }) {
        const width = scene.cameras.main.width;
        const totalWidth = OPTION_WIDTH * 2 + OPTION_GAP;
        const x = width / 2 - totalWidth / 2 + OPTION_WIDTH / 2 + index * (OPTION_WIDTH + OPTION_GAP);

        const card = scene.add.rectangle(x, OPTION_Y, OPTION_WIDTH, OPTION_HEIGHT, 0xFFFFFF);
        card.setStrokeStyle(4, 0x3498DB);
        card.setInteractive({ useHandCursor: true });
        this.uiElements.push(card);

        const contents = decorate(x, OPTION_Y);
        contents.forEach(element => this.uiElements.push(element));

        card.on('pointerover', () => {
            if (this.isRevealing) return;
            card.setFillStyle(0xECF0F1);
            card.setStrokeStyle(6, 0x2980B9);
        });
        card.on('pointerout', () => {
            if (this.isRevealing) return;
            card.setFillStyle(0xFFFFFF);
            card.setStrokeStyle(4, 0x3498DB);
        });
        card.on('pointerdown', () => {
            if (this.isRevealing) return;
            onSelect();
        });

        if (onListen && this.showListenHelp) {
            const badge = scene.add.text(
                x + OPTION_WIDTH / 2 - 34,
                OPTION_Y - OPTION_HEIGHT / 2 + 30,
                '🔊',
                { fontSize: '40px', padding: { y: 10 } }
            ).setOrigin(0.5).setInteractive({ useHandCursor: true });

            badge.on('pointerdown', () => {
                badge.setScale(0.9);
                scene.time.delayedCall(100, () => badge.setScale(1.0));
                onListen();
            });
            this.uiElements.push(badge);
        }

        this.optionButtons.push({ card, contents, x, y: OPTION_Y });
        return card;
    }

    // Step 1 cards: the same vowel drawn long (left) and short (right).
    createLengthOptions(scene) {
        const { vowel, targetIsLong } = this.challengeData;

        [true, false].forEach((isLongCard, index) => {
            this.createOptionCard(scene, index, {
                decorate: (x, y) => {
                    const letter = scene.add.text(x, y - 18, vowel.toUpperCase(), {
                        font: 'bold 64px Arial',
                        fill: '#2C3E50'
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
            this.createOptionCard(scene, index, {
                decorate: (x, y) => [
                    scene.add.text(x, y, cluster.toUpperCase(), {
                        fontSize: '72px',
                        fontFamily: 'Arial',
                        color: '#2C3E50',
                        fontStyle: 'bold',
                        padding: { y: 10 }
                    }).setOrigin(0.5)
                ],
                onSelect: () => this.handleAnswer(scene, isLongForm === targetIsLong, cluster, index),
                onListen: () => this.playVowel(scene, vowel, isLongForm)
            });
        });
    }

    // ---------------- Progress ----------------

    createBallIndicators(scene) {
        const width = scene.cameras.main.width;
        const spacing = 60;
        const startX = width / 2 - ((this.requiredCorrect - 1) * spacing) / 2;

        this.ballIndicators = [];
        for (let i = 0; i < this.requiredCorrect; i++) {
            const circle = scene.add.circle(startX + i * spacing, BALL_INDICATOR_Y, 20,
                i < this.correctCount ? 0x27AE60 : 0xffffff, 1);
            circle.setStrokeStyle(3, 0x000000);
            this.ballIndicators.push(circle);
            this.uiElements.push(circle);
        }

        const gift = scene.add.text(startX + this.requiredCorrect * spacing, BALL_INDICATOR_Y, '🎁', {
            fontSize: '48px',
            padding: { y: 10 }
        }).setOrigin(0.5);
        this.uiElements.push(gift);
    }

    updateBallIndicators() {
        this.ballIndicators.forEach((circle, i) => {
            circle.setFillStyle(i < this.correctCount ? 0x27AE60 : 0xffffff);
        });
    }

    // ---------------- Answering ----------------

    handleAnswer(scene, isCorrect, answer, index) {
        this.isRevealing = true;
        const chosen = this.optionButtons[index];
        const label = this.roundType === ROUND_SOUND
            ? `${this.challengeData.vowel}_${this.challengeData.targetIsLong ? 'long' : 'short'}`
            : this.challengeData.target;

        if (isCorrect) {
            this.correctCount++;
            this.updateBallIndicators();
            chosen.card.setFillStyle(0x27AE60, 0.5);
            chosen.card.setStrokeStyle(6, 0x27AE60);
            this.reveal(scene, () => this.advance(scene));
        } else {
            trackWrongAnswer('VowelSoundsMode', label, String(answer));

            chosen.card.setFillStyle(0xFF0000, 0.5);
            const originalX = chosen.card.x;
            scene.tweens.add({
                targets: [chosen.card, ...chosen.contents],
                x: '-=10',
                duration: 50,
                yoyo: true,
                repeat: 3,
                onComplete: () => {
                    // yoyo + repeat brings every target back to where it started
                    chosen.card.x = originalX;
                    chosen.card.setFillStyle(0xFFFFFF, 1);
                    // The reveal runs on a miss too - the error is the lesson.
                    // Progress is kept, as in VowelLengthMode.
                    this.reveal(scene, () => this.advance(scene));
                }
            });
        }
    }

    advance(scene) {
        if (this.correctCount >= this.requiredCorrect) {
            scene.time.delayedCall(500, () => {
                if (this.answerCallback) {
                    const answer = this.challengeData.target || this.challengeData.vowel;
                    this.answerCallback(true, answer, scene.cameras.main.width / 2, WORD_Y);
                }
            });
        } else {
            scene.time.delayedCall(700, () => {
                this.isRevealing = false;
                this.cleanup(scene);
                this.generateChallenge();
                this.createChallengeUI(scene);
            });
        }
    }

    // ---------------- Reveal ----------------

    reveal(scene, onDone) {
        this.optionButtons.forEach(({ card }) => card.disableInteractive());

        // Light up the correct card so the eye lands on the right answer even
        // after a miss.
        const correctIndex = this.challengeData.targetIsLong ? 0 : 1;
        const correct = this.optionButtons[correctIndex];
        if (correct) {
            correct.card.setFillStyle(0x27AE60, 0.5);
            correct.card.setStrokeStyle(6, 0x27AE60);
        }

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
            fill: '#00838F'
        }).setOrigin(0.5);
        const bar = scene.add.rectangle(x, WORD_Y + 62, 56, 16, 0x00838F, 0.9);
        this.wordElements.push(letter, bar);
        this.uiElements.push(letter, bar);

        this.playVowel(scene, vowel, targetIsLong);

        if (targetIsLong) {
            scene.tweens.add({ targets: letter, scaleX: VOWEL_STRETCH, duration: 600, ease: 'Sine.easeOut' });
            // The bar grows from short to long (56px -> 280px) along with the letter
            scene.tweens.add({ targets: bar, scaleX: 5, duration: 600, ease: 'Sine.easeOut' });
        } else {
            scene.tweens.add({
                targets: letter,
                scaleX: VOWEL_SQUEEZE,
                duration: 180,
                yoyo: true,
                repeat: 1,
                ease: 'Quad.easeOut',
                onComplete: () => letter.setScale(VOWEL_SQUEEZE, 1)
            });
        }

        scene.time.delayedCall(1100, onDone);
    }

    // Step 2: the whole word is spelled out and read aloud. The consonant(s)
    // before the vowel are dimmed: they are not what the question was about.
    revealWord(scene, onDone) {
        const { target, targetIsLong, parts } = this.challengeData;
        this.destroyWord();

        const width = scene.cameras.main.width;
        const chars = target.split('');
        const startX = width / 2 - ((chars.length - 1) * LETTER_STEP) / 2;
        const vowelIndex = parts.stem.length - 1;
        const clusterLength = targetIsLong ? parts.longCluster.length : parts.shortCluster.length;

        chars.forEach((char, index) => {
            const x = startX + index * LETTER_STEP;
            const isVowel = index === vowelIndex;
            const isCluster = index > vowelIndex && index <= vowelIndex + clusterLength;
            const letter = scene.add.text(x, WORD_Y, char.toUpperCase(), {
                font: LETTER_FONT,
                fill: isVowel ? '#00838F' : (isCluster ? '#2C3E50' : '#B0BEC5')
            }).setOrigin(0.5);
            this.letterObjects.push({ text: letter, baseX: x, index, isVowel });
            this.wordElements.push(letter);
            this.uiElements.push(letter);
        });

        this.playWord(scene, target);

        const vowel = this.letterObjects.find(l => l.isVowel);
        if (targetIsLong) {
            const delta = (VOWEL_STRETCH - 1) * LETTER_STEP * 0.6;
            scene.tweens.add({
                targets: vowel.text,
                scaleX: VOWEL_STRETCH,
                x: vowel.baseX + delta / 2,
                duration: 600,
                ease: 'Sine.easeOut'
            });
            this.letterObjects
                .filter(l => l.index > vowel.index)
                .forEach(l => scene.tweens.add({ targets: l.text, x: l.baseX + delta, duration: 600, ease: 'Sine.easeOut' }));
        } else {
            scene.tweens.add({
                targets: vowel.text,
                scaleX: VOWEL_SQUEEZE,
                duration: 180,
                yoyo: true,
                repeat: 1,
                ease: 'Quad.easeOut'
            });
            this.letterObjects
                .filter(l => l.index > vowel.index && l.index <= vowel.index + clusterLength)
                .forEach(l => scene.tweens.add({
                    targets: l.text,
                    scaleX: 1.25,
                    scaleY: 1.25,
                    duration: 300,
                    yoyo: true,
                    ease: 'Sine.easeInOut'
                }));
        }

        scene.time.delayedCall(1300, onDone);
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

    // ---------------- Audio ----------------

    // One player for everything: the child will tap back and forth between
    // long and short, and overlapping playback hides exactly the difference
    // they are supposed to hear.
    playKey(scene, key) {
        if (this.currentAudio) {
            if (this.currentAudio.isPlaying) this.currentAudio.stop();
            this.currentAudio.destroy();
            this.currentAudio = null;
        }
        if (!scene.cache.audio.exists(key)) {
            console.warn(`Audio not found: ${key}`);
            return;
        }
        this.currentAudio = scene.sound.add(key);
        this.currentAudio.play();
    }

    playVowel(scene, vowel, isLong) {
        this.playKey(scene, `vowel_audio_${vowel}_${isLong ? 'long' : 'short'}`);
    }

    playWord(scene, word) {
        this.playKey(scene, `word_audio_${word}`);
    }

    checkAnswer(answer) {
        return answer === this.challengeData.targetIsLong;
    }

    cleanup(scene) {
        if (this.currentAudio) {
            if (this.currentAudio.isPlaying) this.currentAudio.stop();
            this.currentAudio.destroy();
            this.currentAudio = null;
        }

        this.uiElements.forEach(element => {
            if (element && element.destroy) element.destroy();
        });
        this.uiElements = [];
        this.optionButtons = [];
        this.letterObjects = [];
        this.wordElements = [];
        this.ballIndicators = [];
        this.isRevealing = false;
    }
}
