import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { getConfiguredLetters } from '../letterData.js';
import { trackWrongAnswer } from '../wrongAnswers.js';
import { resetStreak } from '../streak.js';
import { updateBoosterBar } from '../boosterBar.js';

/**
 * Letter Listening game mode
 * Player hears a Swedish letter and must select the correct letter from choices
 */
export class LetterListeningMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.usedLetters = new Set();
        this.currentAudio = null;
        this.hasError = false; // Track if player made an error
        this.isRevealing = false; // Track if we're showing the answer
        this.letterButtons = []; // Store button references
        this.correctInRow = 0; // Track consecutive correct answers
        this.requiredCorrect = 3; // Need 3 correct to get Pokemon
        this.ballIndicators = []; // Visual progress indicators
        // Start with default letters, will be updated when config is loaded
        this.availableLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
            'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'Å', 'Ä', 'Ö'];
        this.configLoaded = false;
    }

    async loadConfig() {
        this.availableLetters = await getConfiguredLetters();
        this.configLoaded = true;
        console.log('LetterListeningMode loaded with letters:', this.availableLetters);
    }

    generateChallenge() {
        // Get unused letters from configured set
        const availableLetters = this.availableLetters.filter(
            letter => !this.usedLetters.has(letter)
        );

        // If all letters used, reset
        if (availableLetters.length === 0) {
            this.usedLetters.clear();
            return this.generateChallenge();
        }

        // Pick random letter
        const correctLetter = Phaser.Utils.Array.GetRandom(availableLetters);
        this.usedLetters.add(correctLetter);

        // Generate 5 distractors (letters that are not the correct one)
        const otherLetters = this.availableLetters.filter(l => l !== correctLetter);
        const distractors = Phaser.Utils.Array.Shuffle(otherLetters).slice(0, 5);

        // Shuffle all choices (correct + distractors)
        const allChoices = [correctLetter, ...distractors];
        const shuffledChoices = Phaser.Utils.Array.Shuffle([...allChoices]);

        this.challengeData = {
            correctLetter: correctLetter,
            letters: shuffledChoices
        };

        return this.challengeData;
    }

    createChallengeUI(scene) {
        const width = scene.cameras.main.width;
        const height = scene.cameras.main.height;

        // Play the letter audio automatically
        this.playLetterAudio(scene, this.challengeData.correctLetter);

        // Speaker button to replay audio (larger, centered)
        const speakerBtn = scene.add.text(width / 2, 180, '🔊', {
            font: '80px Arial',
            padding: { y: 20 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        speakerBtn.setData('clearOnNewChallenge', true);
        this.uiElements.push(speakerBtn);

        // Hover effects for speaker
        speakerBtn.on('pointerover', () => {
            speakerBtn.setScale(1.1);
        });

        speakerBtn.on('pointerout', () => {
            speakerBtn.setScale(1.0);
        });

        // Replay audio on click
        speakerBtn.on('pointerdown', () => {
            speakerBtn.setScale(0.9);
            scene.time.delayedCall(100, () => {
                speakerBtn.setScale(1.0);
            });
            this.playLetterAudio(scene, this.challengeData.correctLetter);
        });

        // Create ball indicators showing progress
        this.createBallIndicators(scene);

        // Create letter buttons in a grid (2 rows of 3)
        const letterButtonSize = 100;
        const letterSpacing = 30;
        const cols = 3;
        const rows = Math.ceil(this.challengeData.letters.length / cols);

        const gridWidth = cols * (letterButtonSize + letterSpacing) - letterSpacing;
        const gridHeight = rows * (letterButtonSize + letterSpacing) - letterSpacing;
        const startX = (width - gridWidth) / 2 + letterButtonSize / 2;
        const startY = 400;

        this.challengeData.letters.forEach((letter, index) => {
            const row = Math.floor(index / cols);
            const col = index % cols;
            const x = startX + col * (letterButtonSize + letterSpacing);
            const y = startY + row * (letterButtonSize + letterSpacing);

            // Background button
            const button = scene.add.rectangle(x, y, letterButtonSize, letterButtonSize, 0xFFFFFF);
            button.setStrokeStyle(4, 0x3498DB);
            button.setInteractive({ useHandCursor: true });
            button.setData('clearOnNewChallenge', true);
            button.setData('letter', letter);
            this.uiElements.push(button);

            // Letter text
            const letterText = scene.add.text(x, y, letter, {
                font: 'bold 56px Arial',
                fill: '#2C3E50'
            }).setOrigin(0.5);
            letterText.setData('clearOnNewChallenge', true);
            this.uiElements.push(letterText);

            // Store button reference
            this.letterButtons.push({ button, letterText, letter, x, y });

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

                const isCorrect = this.checkAnswer(letter);

                if (!isCorrect) {
                    // Wrong answer - show error feedback then highlight correct answer
                    this.showWrongAnswerFeedback(scene, button);
                } else {
                    // Correct answer!
                    this.correctInRow++;
                    this.updateBallIndicators();

                    // Show success feedback
                    button.setFillStyle(0x27AE60, 0.5); // Green
                    button.setStrokeStyle(6, 0x27AE60);

                    // Check if won
                    if (this.correctInRow >= this.requiredCorrect) {
                        // Player got 3 in a row! Give Pokemon
                        scene.time.delayedCall(500, () => {
                            if (this.answerCallback) {
                                this.answerCallback(true, letter, x, y);
                            }
                        });
                    } else {
                        // Continue to next challenge
                        scene.time.delayedCall(800, () => {
                            this.cleanup(scene);
                            this.generateChallenge();
                            this.createChallengeUI(scene);
                        });
                    }
                }
            });
        });
    }

    createBallIndicators(scene) {
        const width = scene.cameras.main.width;
        const y = 310;
        const spacing = 60;

        const startX = width / 2 - ((this.requiredCorrect - 1) * spacing) / 2;

        this.ballIndicators = [];

        for (let i = 0; i < this.requiredCorrect; i++) {
            const x = startX + i * spacing;

            // Create circle indicator
            const circle = scene.add.circle(x, y, 20,
                i < this.correctInRow ? 0x27AE60 : 0xffffff, 1);
            circle.setStrokeStyle(3, 0x000000);

            this.ballIndicators.push(circle);
            this.uiElements.push(circle);
        }

        // Add gift emoji at the end
        const giftX = startX + this.requiredCorrect * spacing;
        const giftEmoji = scene.add.text(giftX, y, '🎁', {
            fontSize: '48px',
            padding: { y: 10 }
        }).setOrigin(0.5);
        this.uiElements.push(giftEmoji);
    }

    updateBallIndicators() {
        // Update ball colors based on correctInRow
        for (let i = 0; i < this.ballIndicators.length; i++) {
            if (i < this.correctInRow) {
                this.ballIndicators[i].setFillStyle(0x27AE60); // Green
            } else {
                this.ballIndicators[i].setFillStyle(0xffffff); // White
            }
        }
    }

    playLetterAudio(scene, letter) {
        const audioKey = `letter_audio_${letter.toLowerCase()}`;
        scene.sound.play(audioKey);
    }

    checkAnswer(selectedLetter) {
        return selectedLetter === this.challengeData.correctLetter;
    }

    showWrongAnswerFeedback(scene, wrongButton) {
        // Track wrong answer
        const wrongLetter = wrongButton.getData('letter');
        trackWrongAnswer(
            'LetterListeningMode',
            this.challengeData.correctLetter,
            wrongLetter
        );

        // Reset progress
        this.correctInRow = 0;
        this.updateBallIndicators();

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
        this.letterButtons.forEach(item => {
            item.button.disableInteractive();
        });

        // Find the correct button
        const correctButton = this.letterButtons.find(item =>
            item.letter === this.challengeData.correctLetter
        );

        if (!correctButton) return;

        // Change to gold/attention-grabbing color
        correctButton.button.setFillStyle(0xFFD700, 0.5); // Gold fill
        correctButton.button.setStrokeStyle(6, 0xFFD700); // Thick gold border

        // Pulsing scale animation
        scene.tweens.add({
            targets: [correctButton.button, correctButton.letterText],
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
        this.letterButtons = [];
        this.ballIndicators = [];
    }
}
