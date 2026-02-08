import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { getEmojiWordDictionary, getLetterFilterEnabled, transformWordCase } from '../emojiWordDictionary.js';
import { trackWrongAnswer } from '../wrongAnswers.js';
import { resetStreak } from '../streak.js';
import { updateBoosterBar } from '../boosterBar.js';

/**
 * Emoji-Word matching game mode (inverse of WordEmojiMatchMode)
 * Player must select the correct Swedish word that matches the displayed emoji
 */
export class EmojiWordMatchMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.usedChallengeIds = new Set();
        this.hasError = false; // Track if player made an error
        this.isRevealing = false; // Track if we're showing the answer
        this.wordButtons = []; // Store button references
        this.currentLetter = null; // Track current letter for filtering
    }

    generateChallenge() {
        const dictionary = getEmojiWordDictionary();
        const letterFilterEnabled = getLetterFilterEnabled();

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
                return this.generateChallenge();
            }
        } else {
            // Normal mode: any word
            availableChallenges = dictionary.filter(
                item => !this.usedChallengeIds.has(item.id)
            );

            // If all challenges used, reset
            if (availableChallenges.length === 0) {
                this.usedChallengeIds.clear();
                return this.generateChallenge();
            }
        }

        // Pick random challenge
        const challenge = Phaser.Utils.Array.GetRandom(availableChallenges);
        this.usedChallengeIds.add(challenge.id);

        // Pick 4 random other words as distractors
        let otherChallenges;
        if (letterFilterEnabled) {
            // Distractors from same letter
            otherChallenges = dictionary.filter(
                c => c.id !== challenge.id && c.letter === this.currentLetter
            );
        } else {
            // Distractors from any letter
            otherChallenges = dictionary.filter(c => c.id !== challenge.id);
        }

        const shuffledOthers = Phaser.Utils.Array.Shuffle([...otherChallenges]);
        const distractorWords = shuffledOthers.slice(0, 4).map(c => c.word);

        // Shuffle words (correct + distractors)
        const allWords = [challenge.word, ...distractorWords];
        const shuffledWords = Phaser.Utils.Array.Shuffle([...allWords]);

        this.challengeData = {
            emoji: challenge.emoji,
            correctWord: challenge.word,
            words: shuffledWords
        };

        return this.challengeData;
    }

    async createChallengeUI(scene) {
        const width = scene.cameras.main.width;
        const height = scene.cameras.main.height;

        // Display the emoji
        const emojiText = scene.add.text(width / 2, 200, this.challengeData.emoji, {
            font: '144px Arial'
        }).setOrigin(0.5);
        emojiText.setData('clearOnNewChallenge', true);
        this.uiElements.push(emojiText);

        // Create word buttons in a grid layout
        const buttonWidth = 280;
        const buttonHeight = 80;
        const spacing = 20;
        const wordsPerRow = 3;
        const rows = Math.ceil(this.challengeData.words.length / wordsPerRow);

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
            const button = scene.add.rectangle(x, y, buttonWidth, buttonHeight, 0xFFFFFF);
            button.setStrokeStyle(4, 0x3498DB);
            button.setInteractive({ useHandCursor: true });
            button.setData('clearOnNewChallenge', true);
            button.setData('word', word);
            this.uiElements.push(button);

            // Word text with text case transformation (use pre-fetched transformed word)
            const displayWord = transformedWords[index];
            const wordText = scene.add.text(x, y, displayWord, {
                font: 'bold 36px Arial',
                fill: '#2C3E50'
            }).setOrigin(0.5);
            wordText.setData('clearOnNewChallenge', true);
            this.uiElements.push(wordText);

            // Store button reference (keep original word for answer checking)
            this.wordButtons.push({ button, wordText, word, x, y });

            // Hover effects
            button.on('pointerover', () => {
                if (!this.isRevealing) {
                    button.setFillStyle(0xECF0F1);
                    button.setStrokeStyle(6, 0x2980B9);
                }
            });

            button.on('pointerout', () => {
                if (!this.isRevealing) {
                    button.setFillStyle(0xFFFFFF);
                    button.setStrokeStyle(4, 0x3498DB);
                }
            });

            // Click handler
            button.on('pointerdown', () => {
                if (this.isRevealing) return; // Don't allow clicks during reveal

                const isCorrect = this.checkAnswer(word);

                if (!isCorrect) {
                    // Wrong answer - show error feedback then highlight correct answer
                    this.showWrongAnswerFeedback(scene, button);
                } else {
                    // Correct answer - proceed as normal
                    this.answerCallback(isCorrect, word, x, y);
                }
            });
        });
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

        // Red flash on the wrong button
        wrongButton.setFillStyle(0xFF0000, 0.5); // Red fill
        wrongButton.setStrokeStyle(6, 0xFF0000); // Red border

        // Shake animation
        const originalX = wrongButton.x;
        scene.tweens.add({
            targets: wrongButton,
            x: originalX - 10,
            duration: 50,
            yoyo: true,
            repeat: 3,
            onComplete: () => {
                // Reset button appearance
                wrongButton.setFillStyle(0xFFFFFF);
                wrongButton.setStrokeStyle(4, 0x3498DB);
                wrongButton.x = originalX;

                // ONE ERROR = GAME OVER
                // Highlight the correct answer
                this.hasError = true;
                this.highlightCorrectAnswer(scene);
            }
        });
    }

    highlightCorrectAnswer(scene) {
        this.isRevealing = true;

        // Disable all buttons
        this.wordButtons.forEach(item => {
            item.button.disableInteractive();
        });

        // Find the correct button
        const correctButton = this.wordButtons.find(item =>
            item.word === this.challengeData.correctWord
        );

        if (!correctButton) return;

        // Change to gold/attention-grabbing color
        correctButton.button.setFillStyle(0xFFD700, 0.5); // Gold fill
        correctButton.button.setStrokeStyle(6, 0xFFD700); // Thick gold border

        // Pulsing scale animation
        scene.tweens.add({
            targets: [correctButton.button, correctButton.wordText],
            scaleX: 1.2,
            scaleY: 1.2,
            duration: 500,
            yoyo: true,
            repeat: 3, // Pulse 4 times total (2 seconds)
            ease: 'Sine.easeInOut'
        });

        // Pulsing alpha on button
        scene.tweens.add({
            targets: correctButton.button,
            alpha: 0.7,
            duration: 500,
            yoyo: true,
            repeat: 3,
            ease: 'Sine.easeInOut'
        });

        // After 2 seconds of pulsing, restart with new challenge
        scene.time.delayedCall(2000, () => {
            // Clean up current UI
            this.cleanup(scene);

            // Reset state
            this.hasError = false;
            this.isRevealing = false;

            // Reset streak since player made an error
            resetStreak();

            // Update booster bar visual immediately
            if (scene.boosterBarElements) {
                updateBoosterBar(scene.boosterBarElements, 0, scene);
            }

            // Generate new challenge
            this.generateChallenge();
            this.createChallengeUI(scene);
        });
    }

    cleanup(scene) {
        // Destroy all UI elements
        this.uiElements.forEach(element => {
            if (element && element.destroy) {
                element.destroy();
            }
        });
        this.uiElements = [];
        this.wordButtons = [];
    }
}
