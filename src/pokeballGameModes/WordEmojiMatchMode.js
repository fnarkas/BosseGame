import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { WORD_EMOJI_CHALLENGES } from '../wordEmojiData.js';

/**
 * Word-Emoji matching game mode
 * Player must select the correct emoji that matches the displayed Swedish word
 */
export class WordEmojiMatchMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.usedChallengeIds = new Set();
        this.hasError = false; // Track if player made an error
        this.isRevealing = false; // Track if we're showing the answer
        this.emojiButtons = []; // Store button references
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

        // Shuffle emojis (correct + distractors)
        const allEmojis = [challenge.correctEmoji, ...challenge.distractors];
        const shuffledEmojis = Phaser.Utils.Array.Shuffle([...allEmojis]);

        this.challengeData = {
            word: challenge.word,
            correctEmoji: challenge.correctEmoji,
            emojis: shuffledEmojis
        };

        return this.challengeData;
    }

    createChallengeUI(scene) {
        const width = scene.cameras.main.width;
        const height = scene.cameras.main.height;

        // Display the word
        const wordText = scene.add.text(width / 2, 250, this.challengeData.word, {
            font: 'bold 96px Arial',
            fill: '#2C3E50',
            stroke: '#FFFFFF',
            strokeThickness: 8
        }).setOrigin(0.5);
        wordText.setData('clearOnNewChallenge', true);
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
            const button = scene.add.rectangle(x, y, emojiButtonSize, emojiButtonSize, 0xFFFFFF);
            button.setStrokeStyle(4, 0x3498DB);
            button.setInteractive({ useHandCursor: true });
            button.setData('clearOnNewChallenge', true);
            button.setData('emoji', emoji);
            this.uiElements.push(button);

            // Emoji text
            const emojiText = scene.add.text(x, y, emoji, {
                font: '72px Arial'
            }).setOrigin(0.5);
            emojiText.setData('clearOnNewChallenge', true);
            this.uiElements.push(emojiText);

            // Store button reference
            this.emojiButtons.push({ button, emojiText, emoji, x, y });

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

                const isCorrect = this.checkAnswer(emoji);

                if (!isCorrect) {
                    // Wrong answer - show error feedback then highlight correct answer
                    this.showWrongAnswerFeedback(scene, button);
                } else if (this.answerCallback) {
                    // Correct answer - proceed as normal
                    this.answerCallback(isCorrect, emoji, x, y);
                }
            });
        });
    }

    checkAnswer(selectedEmoji) {
        return selectedEmoji === this.challengeData.correctEmoji;
    }

    showWrongAnswerFeedback(scene, wrongButton) {
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
        this.emojiButtons.forEach(item => {
            item.button.disableInteractive();
        });

        // Find the correct button
        const correctButton = this.emojiButtons.find(item =>
            item.emoji === this.challengeData.correctEmoji
        );

        if (!correctButton) return;

        // Change to gold/attention-grabbing color
        correctButton.button.setFillStyle(0xFFD700, 0.5); // Gold fill
        correctButton.button.setStrokeStyle(6, 0xFFD700); // Thick gold border

        // Pulsing scale animation
        scene.tweens.add({
            targets: [correctButton.button, correctButton.emojiText],
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
        this.emojiButtons = [];
    }
}
