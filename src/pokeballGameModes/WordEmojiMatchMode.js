import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { getEmojiWordDictionary, getLetterFilterEnabled, transformWordCase } from '../emojiWordDictionary.js';
import { trackWrongAnswer } from '../wrongAnswers.js';
import { COLORS, TEXT, wireButtonHover } from './uiKit.js';

/**
 * Word-Emoji matching game mode
 * Player must select the correct emoji that matches the displayed Swedish word
 */
export class WordEmojiMatchMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.usedChallengeIds = new Set();
        this.hasError = false; // Track if player made an error
        this.emojiButtons = []; // Store button references
        this.currentLetter = null; // Track current letter for filtering
    }

    pickChallenge(dictionary, letterFilterEnabled) {
        // A word the child just missed comes straight back
        const retry = this.takeRetry();
        const retried = retry ? dictionary.find(item => item.id === retry.id) : null;
        if (retried) {
            if (letterFilterEnabled) this.currentLetter = retried.letter;
            return retried;
        }

        let availableChallenges;

        if (letterFilterEnabled) {
            // Letter filtering mode: pick all words from one letter
            if (!this.currentLetter) {
                // Pick a random letter that has enough words (at least 5)
                const letterGroups = {};
                dictionary.forEach(item => {
                    if (!letterGroups[item.letter]) {
                        letterGroups[item.letter] = [];
                    }
                    letterGroups[item.letter].push(item);
                });

                const validLetters = Object.keys(letterGroups).filter(
                    letter => letterGroups[letter].length >= 5
                );

                if (validLetters.length === 0) {
                    // Fallback to any letter if none have 5+ words
                    const letters = Object.keys(letterGroups);
                    this.currentLetter = Phaser.Utils.Array.GetRandom(letters);
                } else {
                    this.currentLetter = Phaser.Utils.Array.GetRandom(validLetters);
                }
            }

            // Get all unused challenges for this letter
            availableChallenges = dictionary.filter(
                item => item.letter === this.currentLetter && !this.usedChallengeIds.has(item.id)
            );

            // If all challenges for this letter used, pick a new letter
            if (availableChallenges.length === 0) {
                this.usedChallengeIds.clear();
                this.currentLetter = null;
                return this.pickChallenge(dictionary, letterFilterEnabled);
            }
        } else {
            // Normal mode: any word
            availableChallenges = dictionary.filter(
                item => !this.usedChallengeIds.has(item.id)
            );

            // If all challenges used, reset
            if (availableChallenges.length === 0) {
                this.usedChallengeIds.clear();
                return this.pickChallenge(dictionary, letterFilterEnabled);
            }
        }

        return Phaser.Utils.Array.GetRandom(availableChallenges);
    }

    generateChallenge() {
        const dictionary = getEmojiWordDictionary();
        const letterFilterEnabled = getLetterFilterEnabled();

        const challenge = this.pickChallenge(dictionary, letterFilterEnabled);
        this.usedChallengeIds.add(challenge.id);

        // Pick 4 random other emojis as distractors. Several words share an
        // emoji (BIL/AUTO 🚗, BOLL/FOTBOLL ⚽), so exclude the correct emoji
        // and de-duplicate, otherwise the same picture appears twice.
        let otherChallenges;
        if (letterFilterEnabled) {
            // Distractors from same letter
            otherChallenges = dictionary.filter(
                c => c.id !== challenge.id && c.letter === this.currentLetter && c.emoji !== challenge.emoji
            );
        } else {
            // Distractors from any letter
            otherChallenges = dictionary.filter(c => c.id !== challenge.id && c.emoji !== challenge.emoji);
        }

        const shuffledOthers = Phaser.Utils.Array.Shuffle([...otherChallenges]);
        const distractorEmojis = [...new Set(shuffledOthers.map(c => c.emoji))].slice(0, 4);

        // Shuffle emojis (correct + distractors)
        const allEmojis = [challenge.emoji, ...distractorEmojis];
        const shuffledEmojis = Phaser.Utils.Array.Shuffle([...allEmojis]);

        this.challengeData = {
            id: challenge.id,
            word: challenge.word,
            correctEmoji: challenge.emoji,
            emojis: shuffledEmojis
        };

        return this.challengeData;
    }

    async createChallengeUI(scene) {
        const width = scene.cameras.main.width;

        // A fresh challenge always starts accepting input again.
        this.inputLocked = false;
        this.isRevealing = false;

        // Display the word with text case transformation
        const displayWord = await transformWordCase(this.challengeData.word);
        const wordText = scene.add.text(width / 2, 250, displayWord, {
            font: 'bold 96px Arial',
            fill: COLORS.TEXT_DARK,
            stroke: '#FFFFFF',
            strokeThickness: 8
        }).setOrigin(0.5);
        this.uiElements.push(wordText);

        // Create emoji buttons in a row
        const emojiButtonSize = 120;
        const emojiSpacing = 30;
        const totalWidth = this.challengeData.emojis.length * (emojiButtonSize + emojiSpacing) - emojiSpacing;
        const startX = (width - totalWidth) / 2 + emojiButtonSize / 2;
        const y = 450;

        this.challengeData.emojis.forEach((emoji, index) => {
            const x = startX + index * (emojiButtonSize + emojiSpacing);

            // Background button
            const button = scene.add.rectangle(x, y, emojiButtonSize, emojiButtonSize, COLORS.NEUTRAL_FILL);
            button.setStrokeStyle(4, COLORS.NEUTRAL_STROKE);
            button.setInteractive({ useHandCursor: true });
            button.setData('emoji', emoji);
            this.uiElements.push(button);

            // Emoji text
            const emojiText = scene.add.text(x, y, emoji, TEXT.emojiLg).setOrigin(0.5);
            this.uiElements.push(emojiText);

            // Store button reference
            this.emojiButtons.push({ button, emojiText, emoji, x, y });

            wireButtonHover(button, () => this.isInputBlocked());

            // Click handler
            button.on('pointerdown', () => {
                // Ignore taps during the reveal and while an answer is being resolved
                if (this.isInputBlocked()) return;
                this.inputLocked = true;

                const isCorrect = this.checkAnswer(emoji);

                if (!isCorrect) {
                    // Wrong answer - show error feedback then highlight correct answer
                    this.showWrongAnswerFeedback(scene, button);
                } else {
                    // Correct answer - proceed as normal
                    this.finish(true, emoji, x, y);
                }
            });
        });
    }

    checkAnswer(selectedEmoji) {
        return selectedEmoji === this.challengeData.correctEmoji;
    }

    showWrongAnswerFeedback(scene, wrongButton) {
        // Track wrong answer
        const wrongEmoji = wrongButton.getData('emoji');
        trackWrongAnswer(
            'WordEmojiMatchMode',
            this.challengeData.correctEmoji,
            wrongEmoji,
            { word: this.challengeData.word }
        );

        // Red shake on the wrong button, then ONE ERROR = GAME OVER:
        // highlight the correct answer and say the word.
        this.shakeWrong(scene, wrongButton, {
            onComplete: () => this.highlightCorrectAnswer(scene)
        });
    }

    highlightCorrectAnswer(scene) {
        const { id, word, correctEmoji } = this.challengeData;
        const correctButton = this.emojiButtons.find(item => item.emoji === correctEmoji);

        // Ask the missed word again right away, and once more a bit later
        this.queueRetry({ id }, 0);
        this.queueRetry({ id }, 2);

        this.revealAnswer(scene, {
            targets: correctButton ? [correctButton.button, correctButton.emojiText] : [],
            disable: this.emojiButtons.map(item => item.button),
            audioKey: `word_audio_${word.toLowerCase()}`
        });
    }

    cleanup(scene) {
        super.cleanup(scene);
        this.emojiButtons = [];
    }
}
