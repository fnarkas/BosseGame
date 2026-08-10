import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { VOWEL_PAIRS, firstVowelOf } from '../vowelLengthPairs.js';
import { trackWrongAnswer } from '../wrongAnswers.js';

/**
 * Vowel length game mode
 *
 * Swedish has complementary quantity: in a stressed syllable either the vowel is
 * long and the following consonant short (tak = [ta:k]) or the vowel is short and
 * the consonant long (tack = [tak:]). The doubled consonant in writing is what
 * marks which one it is. This mode drills that with minimal pairs, from three
 * angles on the SAME pair within one round:
 *
 *   0. Hear the word, pick the written form.       glas / glass
 *   1. See the word, hear one reading, judge it.   ✅ / ❌
 *   2. Hear the word, pick one or two consonants.  s / ss
 *
 * On every answer the word is spelled out and the vowel visibly stretches (long)
 * or snaps together (short), so the rule is shown rather than told.
 */

// Layout for the 1280x900 canvas. The booster bar occupies y 35-85.
const STIMULUS_Y = 190;
const WORD_Y = 350;
const OPTION_Y = 530;
const BALL_INDICATOR_Y = 690;

const OPTION_WIDTH = 380;
const OPTION_HEIGHT = 150;
const OPTION_GAP = 80;

// Word rendering
const LETTER_STEP = 76;      // Horizontal distance between letter centres
const LETTER_FONT = 'bold 84px Arial';
const VOWEL_STRETCH = 2.4;   // How wide a long vowel grows

const ROUND_PICK_SPELLING = 0;
const ROUND_JUDGE_READING = 1;
const ROUND_PICK_CONSONANTS = 2;
const ROUND_COUNT = 3;

// Split a minimal pair at the vowel, into the parts it is built from:
//   vila / villa -> { stem: 'vi',  longCluster: 'l', shortCluster: 'll', tail: 'a' }
//   tak  / tack  -> { stem: 'ta',  longCluster: 'k', shortCluster: 'ck', tail: ''  }
// long = stem + longCluster + tail, short = stem + shortCluster + tail.
//
// Splitting at the vowel rather than at the first differing character matters:
// Swedish writes a long /k/ as "ck", not "kk", so tack and bock are not simple
// letter doublings, and a naive prefix comparison mis-splits them.
const VOWEL_RE = /[aeiouyåäö]/;

export function splitPair(long, short) {
    const v = long.search(VOWEL_RE);
    const clusterAfterVowel = (word) => {
        const rest = word.slice(v + 1);
        const match = rest.match(/^[^aeiouyåäö]+/);
        return match ? match[0] : '';
    };

    const longCluster = clusterAfterVowel(long);
    return {
        stem: long.slice(0, v + 1),
        longCluster,
        shortCluster: clusterAfterVowel(short),
        tail: long.slice(v + 1 + longCluster.length)
    };
}

export class VowelLengthMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.currentPair = null;
        this.roundType = ROUND_PICK_SPELLING;
        this.correctCount = 0;
        this.requiredCorrect = 3;
        this.showListenHelp = true;
        this.configLoaded = false;

        this.optionButtons = [];
        this.letterObjects = [];   // { text, char, index, baseX }
        this.wordElements = [];    // Everything belonging to the displayed word
        this.ballIndicators = [];
        this.isRevealing = false;
        this.currentAudio = null;
    }

    async loadConfig() {
        try {
            const response = await fetch('/config/minigames.json');
            if (response.ok) {
                const config = await response.json();
                if (config.vowelLength) {
                    this.requiredCorrect = config.vowelLength.required || this.requiredCorrect;
                    this.showListenHelp = config.vowelLength.showListenHelp !== false;
                }
            }
        } catch (error) {
            console.warn('Failed to load vowel length config, using defaults:', error);
        }
        this.configLoaded = true;
        console.log('VowelLengthMode loaded with settings:', {
            required: this.requiredCorrect,
            showListenHelp: this.showListenHelp,
            pairs: VOWEL_PAIRS.length
        });
    }

    generateChallenge() {
        // One pair carries the whole round, seen from all three angles.
        if (this.correctCount === 0 || !this.currentPair) {
            this.currentPair = VOWEL_PAIRS[Phaser.Math.Between(0, VOWEL_PAIRS.length - 1)];
        }
        this.roundType = this.correctCount % ROUND_COUNT;

        const pair = this.currentPair;
        const targetIsLong = Phaser.Math.Between(0, 1) === 0;
        const target = targetIsLong ? pair.long : pair.short;
        const parts = splitPair(pair.long, pair.short);

        this.challengeData = {
            pair,
            parts,
            target,
            targetIsLong,
            // Round 1 plays one reading at random; the answer is whether it matched.
            playedIsLong: Phaser.Math.Between(0, 1) === 0
        };

        return this.challengeData;
    }

    createChallengeUI(scene) {
        const { target, targetIsLong, parts, playedIsLong } = this.challengeData;

        if (this.roundType === ROUND_PICK_SPELLING) {
            this.createSpeaker(scene, STIMULUS_Y, () => this.playWord(scene, target));
            this.createWordOptions(scene);
            scene.time.delayedCall(300, () => this.playWord(scene, target));

        } else if (this.roundType === ROUND_JUDGE_READING) {
            // The written word is the stimulus; one reading of it is played.
            const played = playedIsLong ? this.challengeData.pair.long : this.challengeData.pair.short;
            this.createSpeaker(scene, STIMULUS_Y, () => this.playWord(scene, played));
            this.renderWord(scene, target, targetIsLong);
            this.createJudgeOptions(scene);
            scene.time.delayedCall(300, () => this.playWord(scene, played));

        } else {
            this.createSpeaker(scene, STIMULUS_Y, () => this.playWord(scene, target));
            this.renderWord(scene, `${parts.stem}${parts.tail}`, targetIsLong, { gapAfter: parts.stem.length - 1 });
            this.createConsonantOptions(scene);
            scene.time.delayedCall(300, () => this.playWord(scene, target));
        }

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

    // ---------------- The word, drawn letter by letter ----------------

    // Letters are separate objects so the vowel can be animated on its own and
    // made tappable. `gapAfter` replaces the consonant with an empty slot.
    //
    // `interactiveVowel` is only ever true on the reveal. While a question is
    // open, a tappable vowel would simply announce the answer: its length IS
    // what is being asked.
    renderWord(scene, word, isLong, { gapAfter = -1, interactiveVowel = false } = {}) {
        this.destroyWord();

        const width = scene.cameras.main.width;
        const chars = word.split('');
        const slots = gapAfter >= 0 ? chars.length + 1 : chars.length;
        const startX = width / 2 - ((slots - 1) * LETTER_STEP) / 2;

        const vowel = firstVowelOf(word);
        let vowelSeen = false;
        let slot = 0;

        const drawGap = () => {
            const gapBox = scene.add.rectangle(
                startX + slot * LETTER_STEP, WORD_Y, LETTER_STEP - 12, 96, 0xFFFFFF, 0.35
            );
            gapBox.setStrokeStyle(4, 0x00838F);
            this.wordElements.push(gapBox);
            this.uiElements.push(gapBox);
            slot++;
        };

        chars.forEach((char, index) => {
            if (gapAfter >= 0 && index === gapAfter + 1) drawGap();

            const x = startX + slot * LETTER_STEP;
            const isVowel = !vowelSeen && char === vowel;
            if (isVowel) vowelSeen = true;

            const letter = scene.add.text(x, WORD_Y, char.toUpperCase(), {
                font: LETTER_FONT,
                fill: isVowel ? '#00838F' : '#2C3E50'
            }).setOrigin(0.5);

            if (isVowel && interactiveVowel) {
                // The vowel is its own button: it plays just that vowel sound,
                // long or short depending on the word.
                letter.setInteractive({ useHandCursor: true });
                letter.on('pointerdown', () => this.playVowel(scene, vowel, isLong));

                const underline = scene.add.rectangle(x, WORD_Y + 56, 52, 6, 0x00838F, 0.8);
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

    // ---------------- Answer options ----------------

    // Two cards, side by side. The card body selects; the small speaker badge in
    // the corner only listens, so the child can compare before committing.
    createOptionCard(scene, index, label, { onSelect, onListen, fontSize = '64px' }) {
        const width = scene.cameras.main.width;
        const totalWidth = OPTION_WIDTH * 2 + OPTION_GAP;
        const x = width / 2 - totalWidth / 2 + OPTION_WIDTH / 2 + index * (OPTION_WIDTH + OPTION_GAP);

        const card = scene.add.rectangle(x, OPTION_Y, OPTION_WIDTH, OPTION_HEIGHT, 0xFFFFFF);
        card.setStrokeStyle(4, 0x3498DB);
        card.setInteractive({ useHandCursor: true });
        this.uiElements.push(card);

        const text = scene.add.text(x, OPTION_Y, label, {
            fontSize,
            fontFamily: 'Arial',
            color: '#2C3E50',
            fontStyle: 'bold',
            padding: { y: 10 }
        }).setOrigin(0.5);
        this.uiElements.push(text);

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

        this.optionButtons.push({ card, text, x, y: OPTION_Y });
        return card;
    }

    createWordOptions(scene) {
        const { pair, target } = this.challengeData;
        const vowel = firstVowelOf(pair.long);
        // Long form on the left, short on the right - a stable place for each.
        [pair.long, pair.short].forEach((word, index) => {
            const isLongForm = index === 0;
            this.createOptionCard(scene, index, word.toUpperCase(), {
                fontSize: '58px',
                onSelect: () => this.handleAnswer(scene, word === target, word, index),
                onListen: () => this.playVowel(scene, vowel, isLongForm)
            });
        });
    }

    createJudgeOptions(scene) {
        const { targetIsLong, playedIsLong } = this.challengeData;
        const matched = targetIsLong === playedIsLong;
        ['✅', '❌'].forEach((label, index) => {
            const saysMatched = index === 0;
            this.createOptionCard(scene, index, label, {
                fontSize: '72px',
                onSelect: () => this.handleAnswer(scene, saysMatched === matched, label, index)
            });
        });
    }

    createConsonantOptions(scene) {
        const { parts, targetIsLong, pair } = this.challengeData;
        const vowel = firstVowelOf(pair.long);
        [parts.longCluster, parts.shortCluster].forEach((cluster, index) => {
            const isLongForm = index === 0;
            this.createOptionCard(scene, index, cluster.toUpperCase(), {
                fontSize: '64px',
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

        // Add gift emoji at the end to show the goal
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
        const { target } = this.challengeData;
        const chosen = this.optionButtons[index];

        if (isCorrect) {
            this.correctCount++;
            this.updateBallIndicators();
            chosen.card.setFillStyle(0x27AE60, 0.5);
            chosen.card.setStrokeStyle(6, 0x27AE60);
            this.revealWord(scene, () => this.advance(scene));
        } else {
            trackWrongAnswer('VowelLengthMode', target, String(answer));

            chosen.card.setFillStyle(0xFF0000, 0.5);
            const originalX = chosen.card.x;
            scene.tweens.add({
                targets: [chosen.card, chosen.text],
                x: originalX - 10,
                duration: 50,
                yoyo: true,
                repeat: 3,
                onComplete: () => {
                    chosen.card.x = originalX;
                    chosen.text.x = originalX;
                    chosen.card.setFillStyle(0xFFFFFF, 1);
                    // The reveal runs on a miss too - the error is the lesson.
                    // Progress is kept, as in MultiplicationMode.
                    this.revealWord(scene, () => this.advance(scene));
                }
            });
        }
    }

    advance(scene) {
        if (this.correctCount >= this.requiredCorrect) {
            scene.time.delayedCall(500, () => {
                if (this.answerCallback) {
                    this.answerCallback(true, this.challengeData.target, scene.cameras.main.width / 2, WORD_Y);
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

    // Spell out the correct word and show what the vowel does: a long vowel
    // stretches wide, a short one snaps together while the doubled consonants
    // swell. The length does not disappear - it moves.
    revealWord(scene, onDone) {
        const { target, targetIsLong } = this.challengeData;

        this.optionButtons.forEach(({ card }) => card.disableInteractive());
        // The answer is settled, so free listening is safe from here on.
        this.renderWord(scene, target, targetIsLong, { interactiveVowel: true });
        this.playWord(scene, target);

        const vowel = this.letterObjects.find(l => l.isVowel);
        if (!vowel) {
            scene.time.delayedCall(600, onDone);
            return;
        }

        if (targetIsLong) {
            const delta = (VOWEL_STRETCH - 1) * LETTER_STEP * 0.6;
            scene.tweens.add({
                targets: vowel.text,
                scaleX: VOWEL_STRETCH,
                x: vowel.baseX + delta / 2,
                duration: 600,
                ease: 'Sine.easeOut'
            });
            // Push the following letters aside so nothing overlaps
            this.letterObjects
                .filter(l => l.index > vowel.index)
                .forEach(l => {
                    scene.tweens.add({
                        targets: l.text,
                        x: l.baseX + delta,
                        duration: 600,
                        ease: 'Sine.easeOut'
                    });
                });
        } else {
            scene.tweens.add({
                targets: vowel.text,
                scaleX: 0.75,
                duration: 180,
                yoyo: true,
                repeat: 1,
                ease: 'Quad.easeOut'
            });
            this.letterObjects
                .filter(l => l.index > vowel.index)
                .forEach(l => {
                    scene.tweens.add({
                        targets: l.text,
                        scaleX: 1.25,
                        scaleY: 1.25,
                        duration: 300,
                        yoyo: true,
                        ease: 'Sine.easeInOut'
                    });
                });
        }

        scene.time.delayedCall(1100, onDone);
    }

    // ---------------- Audio ----------------

    // One player for everything: the child will tap back and forth between the
    // two words, and overlapping playback makes the difference impossible to hear.
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

    playWord(scene, word) {
        this.playKey(scene, `word_audio_${word}`);
    }

    playVowel(scene, vowel, isLong) {
        this.playKey(scene, `vowel_audio_${vowel}_${isLong ? 'long' : 'short'}`);
    }

    checkAnswer(answer) {
        return answer === this.challengeData.target;
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
