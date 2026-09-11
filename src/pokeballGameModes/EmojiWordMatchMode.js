import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { getEmojiWordDictionary, getLetterFilterEnabled, transformWordCase } from '../emojiWordDictionary.js';
import { trackWrongAnswer } from '../wrongAnswers.js';
import { COLORS, TEXT, wireButtonHover } from './uiKit.js';

/**
 * Emoji-Word matching game mode (inverse of WordEmojiMatchMode)
 * Player must select the correct Swedish word that matches the displayed emoji
 */
export class EmojiWordMatchMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.usedChallengeIds = new Set();
        this.hasError = false; // Track if player made an error
        this.wordButtons = []; // Store button references
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

        // Pick 4 random other words as distractors. Several words share an
        // emoji (BIL/AUTO 🚗, BOLL/FOTBOLL ⚽); a distractor that is also a
        // correct name for the shown emoji would be an unfair "wrong" answer.
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
        const distractorWords = [...new Set(shuffledOthers.map(c => c.word))].slice(0, 4);

        // Shuffle words (correct + distractors)
        const allWords = [challenge.word, ...distractorWords];
        const shuffledWords = Phaser.Utils.Array.Shuffle([...allWords]);

        this.challengeData = {
            id: challenge.id,
            emoji: challenge.emoji,
            correctWord: challenge.word,
            words: shuffledWords
        };

        return this.challengeData;
    }

    async createChallengeUI(scene) {
        const width = scene.cameras.main.width;

        // A fresh challenge always starts accepting input again.
        this.inputLocked = false;
        this.isRevealing = false;

        // Display the emoji
        const emojiText = scene.add.text(width / 2, 200, this.challengeData.emoji, {
            font: '144px Arial'
        }).setOrigin(0.5);
        this.uiElements.push(emojiText);

        // Speaker next to the emoji: says the word the child is looking for,
        // so the sound of the word can be matched to its spelling.
        this.createSpeakerButton(scene, width / 2 + 170, 200, () => this.playWordAudio(scene));

        // Create word buttons in a grid layout
        const buttonWidth = 280;
        const buttonHeight = 80;
        const spacing = 20;
        const wordsPerRow = 3;

        // Pre-fetch all transformed words
        const transformedWords = await Promise.all(
            this.challengeData.words.map(word => transformWordCase(word))
        );

        this.challengeData.words.forEach((word, index) => {
            const row = Math.floor(index / wordsPerRow);
            const col = index % wordsPerRow;
            const wordsInRow = Math.min(wordsPerRow, this.challengeData.words.length - row * wordsPerRow);

            // Center each row
            const rowWidth = wordsInRow * (buttonWidth + spacing) - spacing;
            const startX = (width - rowWidth) / 2;

            const x = startX + col * (buttonWidth + spacing) + buttonWidth / 2;
            const y = 380 + row * (buttonHeight + spacing);

            // Background button
            const button = scene.add.rectangle(x, y, buttonWidth, buttonHeight, COLORS.NEUTRAL_FILL);
            button.setStrokeStyle(4, COLORS.NEUTRAL_STROKE);
            button.setInteractive({ useHandCursor: true });
            button.setData('word', word);
            this.uiElements.push(button);

            // Word text with text case transformation (use pre-fetched transformed word)
            const displayWord = transformedWords[index];
            const wordText = scene.add.text(x, y, displayWord, {
                font: 'bold 36px Arial',
                fill: COLORS.TEXT_DARK
            }).setOrigin(0.5);
            this.uiElements.push(wordText);

            // Store button reference (keep original word for answer checking)
            this.wordButtons.push({ button, wordText, word, x, y });

            wireButtonHover(button, () => this.isInputBlocked());

            // Click handler
            button.on('pointerdown', () => {
                // Ignore taps during the reveal and while an answer is being resolved
                if (this.isInputBlocked()) return;
                this.inputLocked = true;

                const isCorrect = this.checkAnswer(word);

                if (!isCorrect) {
                    // Wrong answer - show error feedback then highlight correct answer
                    this.showWrongAnswerFeedback(scene, button);
                } else {
                    // Correct answer - proceed as normal
                    this.finish(true, word, x, y);
                }
            });
        });
    }

    wordAudioKey() {
        return `word_audio_${this.challengeData.correctWord.toLowerCase()}`;
    }

    playWordAudio(scene) {
        this.playAudio(scene, this.wordAudioKey());
    }

    checkAnswer(selectedWord) {
        return selectedWord === this.challengeData.correctWord;
    }

    showWrongAnswerFeedback(scene, wrongButton) {
        // Track wrong answer
        const wrongWord = wrongButton.getData('word');
        trackWrongAnswer(
            'EmojiWordMatchMode',
            this.challengeData.correctWord,
            wrongWord,
            { emoji: this.challengeData.emoji }
        );

        // Red shake on the wrong button, then ONE ERROR = GAME OVER:
        // highlight the correct word and say it.
        this.shakeWrong(scene, wrongButton, {
            onComplete: () => this.highlightCorrectAnswer(scene)
        });
    }

    highlightCorrectAnswer(scene) {
        const { id, correctWord } = this.challengeData;
        const correctButton = this.wordButtons.find(item => item.word === correctWord);

        // Ask the missed word again right away, and once more a bit later
        this.queueRetry({ id }, 0);
        this.queueRetry({ id }, 2);

        this.revealAnswer(scene, {
            targets: correctButton ? [correctButton.button, correctButton.wordText] : [],
            disable: this.wordButtons.map(item => item.button),
            audioKey: this.wordAudioKey()
        });
    }

    cleanup(scene) {
        super.cleanup(scene);
        this.wordButtons = [];
    }
}
