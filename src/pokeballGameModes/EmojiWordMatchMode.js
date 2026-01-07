import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { WORD_EMOJI_CHALLENGES } from '../wordEmojiData.js';
import { trackWrongAnswer } from '../wrongAnswers.js';

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
    }

    generateChallenge() {
        // Get unused challenges
        const availableChallenges = WORD_EMOJI_CHALLENGES.filter(
            challenge => !this.usedChallengeIds.has(challenge.id)
        );

        // If all challenges used, reset
        if (availableChallenges.length === 0) {
            this.usedChallengeIds.clear();
            return this.generateChallenge();
        }

        // Pick random challenge
        const challenge = Phaser.Utils.Array.GetRandom(availableChallenges);
        this.usedChallengeIds.add(challenge.id);

        // Pick 4 random other words as distractors
        const otherChallenges = WORD_EMOJI_CHALLENGES.filter(c => c.id !== challenge.id);
        const shuffledOthers = Phaser.Utils.Array.Shuffle([...otherChallenges]);
        const distractorWords = shuffledOthers.slice(0, 4).map(c => c.word);

        // Shuffle words (correct + distractors)
        const allWords = [challenge.word, ...distractorWords];
        const shuffledWords = Phaser.Utils.Array.Shuffle([...allWords]);

        this.challengeData = {
            emoji: challenge.correctEmoji,
            correctWord: challenge.word,
            words: shuffledWords
        };

        return this.challengeData;
    }

    createChallengeUI(scene) {
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

            // Word text
            const wordText = scene.add.text(x, y, word, {
                font: 'bold 36px Arial',
                fill: '#2C3E50'
            }).setOrigin(0.5);
            wordText.setData('clearOnNewChallenge', true);
            this.uiElements.push(wordText);

            // Store button reference
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
                } else if (this.answerCallback) {
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
