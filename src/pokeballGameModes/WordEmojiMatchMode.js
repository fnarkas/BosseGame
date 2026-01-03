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

            // Hover effects
            button.on('pointerover', () => {
                button.setFillStyle(0xECF0F1);
                button.setStrokeStyle(6, 0x2980B9);
            });

            button.on('pointerout', () => {
                button.setFillStyle(0xFFFFFF);
                button.setStrokeStyle(4, 0x3498DB);
            });

            // Click handler
            button.on('pointerdown', () => {
                const isCorrect = this.checkAnswer(emoji);
                if (this.answerCallback) {
                    this.answerCallback(isCorrect, emoji, x, y);
                }
            });
        });
    }

    checkAnswer(selectedEmoji) {
        return selectedEmoji === this.challengeData.correctEmoji;
    }

    cleanup(scene) {
        // Destroy all UI elements
        this.uiElements.forEach(element => {
            if (element && element.destroy) {
                element.destroy();
            }
        });
        this.uiElements = [];
    }
}
