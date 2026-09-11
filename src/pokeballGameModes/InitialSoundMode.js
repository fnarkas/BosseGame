import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { COLORS, TEXT, wireButtonHover } from './uiKit.js';
import { getEmojiWordDictionary } from '../emojiWordDictionary.js';
import { trackWrongAnswer } from '../wrongAnswers.js';
import { loadModeConfig } from '../minigameConfig.js';
import { pickAdaptive, pickDistractors, HARD_LETTERS } from '../adaptive.js';
import { hasAudio } from '../audio.js';

/**
 * Initial Sound game mode ("välja bilder som börjar på samma bokstav").
 *
 * The child hears a letter (and sees it), then taps the picture whose word
 * starts with that letter: hear "b", tap 🚗? no, 🐶 no, ⚽ (BOLL) yes. It trains
 * the sound → letter link phonologically, which is exactly where the d/b,
 * g/n/h confusions live, without requiring any reading.
 *
 * Wrong tap: the right picture pulses gold while the letter and (when we have
 * the audio) the word are spoken; the same letter comes straight back, and
 * once more a little later.
 */
export class InitialSoundMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.requiredCorrect = 3;
        this.optionCount = 4;
        this.correctInRow = 0;
        this.cards = [];
        this.configLoaded = false;
    }

    async loadConfig() {
        const config = await loadModeConfig('initialSound', { required: 3 });
        this.requiredCorrect = Math.max(1, Math.round(config.required));
        this.configLoaded = true;
    }

    // Dictionary entries grouped by starting letter, only letters we have audio
    // for and at least one picture of.
    wordsByLetter() {
        const groups = new Map();
        for (const entry of getEmojiWordDictionary()) {
            if (!entry || !entry.word || !entry.emoji) continue;
            const letter = String(entry.letter || entry.word[0]).toUpperCase();
            if (!/^[A-ZÅÄÖ]$/.test(letter)) continue;
            if (!groups.has(letter)) groups.set(letter, []);
            groups.get(letter).push({ word: entry.word.toUpperCase(), emoji: entry.emoji, letter });
        }
        return groups;
    }

    generateChallenge() {
        const groups = this.wordsByLetter();
        const letters = [...groups.keys()];
        if (letters.length < 2) {
            throw new Error('InitialSoundMode needs pictures for at least two letters');
        }

        const retry = this.takeRetry();
        const targetLetter = (retry && groups.has(retry))
            ? retry
            : pickAdaptive('InitialSoundMode', letters, { seedList: HARD_LETTERS });

        const targetPool = groups.get(targetLetter);
        const target = targetPool[Math.floor(Math.random() * targetPool.length)];

        // Distractor letters: confusable partners first, then random. One
        // picture per letter, never sharing an emoji with the target.
        const distractorLetters = pickDistractors('InitialSoundMode', targetLetter, letters, this.optionCount - 1);
        const usedEmojis = new Set([target.emoji]);
        const distractors = [];
        for (const letter of distractorLetters) {
            const candidates = groups.get(letter).filter(e => !usedEmojis.has(e.emoji));
            if (candidates.length === 0) continue;
            const pick = candidates[Math.floor(Math.random() * candidates.length)];
            usedEmojis.add(pick.emoji);
            distractors.push(pick);
        }

        const options = [target, ...distractors];
        for (let i = options.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [options[i], options[j]] = [options[j], options[i]];
        }

        this.challengeData = { targetLetter, target, options };
        return this.challengeData;
    }

    createChallengeUI(scene) {
        const width = scene.cameras.main.width;
        this.inputLocked = false;
        this.isRevealing = false;
        this.cards = [];

        const { targetLetter, options } = this.challengeData;

        // Hear the letter now, and again on the speaker
        this.playLetter(scene);
        this.createSpeakerButton(scene, width / 2 - 90, 190, () => this.playLetter(scene));

        // The letter itself is learning content
        const letterText = scene.add.text(width / 2 + 60, 190, targetLetter, {
            ...TEXT.title,
            fontSize: '110px'
        }).setOrigin(0.5);
        this.uiElements.push(letterText);

        this.createProgressBalls(scene, { total: this.requiredCorrect, completed: this.correctInRow, y: 320 });

        // Picture cards
        const cardSize = 200;
        const spacing = 40;
        const totalWidth = options.length * cardSize + (options.length - 1) * spacing;
        const startX = (width - totalWidth) / 2 + cardSize / 2;
        const y = 560;

        options.forEach((option, index) => {
            const x = startX + index * (cardSize + spacing);
            const card = scene.add.rectangle(x, y, cardSize, cardSize, COLORS.NEUTRAL_FILL);
            card.setStrokeStyle(4, COLORS.NEUTRAL_STROKE);
            card.setInteractive({ useHandCursor: true });
            card.setData('word', option.word);
            card.setData('letter', option.letter);
            this.uiElements.push(card);

            const emoji = scene.add.text(x, y, option.emoji, { fontSize: '110px', padding: { y: 20 } }).setOrigin(0.5);
            this.uiElements.push(emoji);

            wireButtonHover(card, () => this.isInputBlocked());
            card.on('pointerdown', () => this.onCardTapped(scene, option, card, emoji, x, y));
            this.cards.push({ option, card, emoji, x, y });
        });
    }

    playLetter(scene) {
        this.playAudio(scene, `letter_audio_${this.challengeData.targetLetter.toLowerCase()}`);
    }

    checkAnswer(option) {
        return option.letter === this.challengeData.targetLetter;
    }

    onCardTapped(scene, option, card, emoji, x, y) {
        if (this.isInputBlocked()) return;
        this.inputLocked = true;

        if (this.checkAnswer(option)) {
            this.correctInRow++;
            this.updateProgressBalls(this.correctInRow);
            card.setFillStyle(COLORS.CORRECT, 0.5);
            card.setStrokeStyle(6, COLORS.CORRECT);
            this.showSuccessParticles(scene, x, y);

            if (this.correctInRow >= this.requiredCorrect) {
                this.delayedCall(scene, 600, () => this.finish(true, option.word, x, y));
            } else {
                this.delayedCall(scene, 800, () => this.restartChallenge(scene, { resetStreak: false }));
            }
            return;
        }

        const { targetLetter, target } = this.challengeData;
        trackWrongAnswer('InitialSoundMode', targetLetter, option.letter);
        this.correctInRow = 0;
        this.updateProgressBalls(0);
        this.queueRetry(targetLetter);
        this.queueRetry(targetLetter, 2);

        const correct = this.cards.find(c => c.option === target);
        const audioKeys = [`letter_audio_${targetLetter.toLowerCase()}`];
        const wordKey = `word_audio_${target.word.toLowerCase()}`;
        if (hasAudio(scene, wordKey)) audioKeys.push(wordKey);

        this.shakeWrong(scene, card, {
            onComplete: () => this.revealAnswer(scene, {
                targets: correct ? [correct.card, correct.emoji] : [],
                disable: this.cards.map(c => c.card),
                audioKeys
            })
        });
    }

    cleanup(scene) {
        super.cleanup(scene);
        this.cards = [];
    }
}
