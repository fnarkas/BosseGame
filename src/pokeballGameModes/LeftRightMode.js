import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { trackWrongAnswer } from '../wrongAnswers.js';
import { resetStreak } from '../streak.js';
import { updateBoosterBar } from '../boosterBar.js';
import { COLORS } from './uiKit.js';

const ZONE_ALPHA = 0.2;

export class LeftRightMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.correctInRow = 0;
        this.totalAttempts = 0;
        this.maxAttempts = 25;
        this.requiredCorrect = 6;
        this.leftZone = null;
        this.rightZone = null;
    }

    generateChallenge() {
        // A direction the child just got wrong is asked again; otherwise
        // choose left or right at random.
        const directions = ['vanster', 'hoger'];
        const correctDirection = this.takeRetry() ?? directions[Math.floor(Math.random() * directions.length)];

        this.challengeData = {
            correctDirection: correctDirection,
            displayName: correctDirection === 'hoger' ? 'Höger' : 'Vänster'
        };
    }

    createChallengeUI(scene) {
        const width = scene.cameras.main.width;
        const height = scene.cameras.main.height;

        // A fresh challenge always starts accepting input again.
        this.inputLocked = false;
        this.isRevealing = false;

        // Speaker button to replay audio (centered at top)
        this.createSpeakerButton(scene, width / 2, 200, () => {
            this.playDirectionAudio(scene, this.challengeData.correctDirection);
        });

        // Vertical dividing line in the middle
        const divider = scene.add.graphics();
        divider.lineStyle(4, COLORS.OUTLINE, 1);
        divider.lineBetween(width / 2, 300, width / 2, height - 100);
        this.uiElements.push(divider);

        // Create clickable zones for left and right (both same neutral color)
        this.leftZone = scene.add.rectangle(width / 4, height / 2 + 50, width / 2 - 20, 300, COLORS.NEUTRAL_FILL, ZONE_ALPHA)
            .setInteractive({ useHandCursor: true });

        this.leftZone.on('pointerdown', () => {
            if (!this.isInputBlocked()) {
                this.handleAnswer(scene, 'vanster');
            }
        });
        this.uiElements.push(this.leftZone);

        this.rightZone = scene.add.rectangle(3 * width / 4, height / 2 + 50, width / 2 - 20, 300, COLORS.NEUTRAL_FILL, ZONE_ALPHA)
            .setInteractive({ useHandCursor: true });

        this.rightZone.on('pointerdown', () => {
            if (!this.isInputBlocked()) {
                this.handleAnswer(scene, 'hoger');
            }
        });
        this.uiElements.push(this.rightZone);

        // Progress balls (one per required answer) ending in the gift
        this.createProgressBalls(scene, { total: this.requiredCorrect, completed: this.correctInRow, y: 500 });

        // Play direction audio automatically when challenge loads
        this.playDirectionAudio(scene, this.challengeData.correctDirection);
    }

    playDirectionAudio(scene, direction) {
        this.playAudio(scene, `direction_audio_${direction}`);
    }

    zoneFor(direction) {
        return direction === 'vanster' ? this.leftZone : this.rightZone;
    }

    handleAnswer(scene, selectedDirection) {
        const isCorrect = selectedDirection === this.challengeData.correctDirection;

        // One answer per challenge - a second tap during the feedback is ignored
        this.inputLocked = true;
        this.totalAttempts++;

        if (isCorrect) {
            this.correctInRow++;
            this.updateProgressBalls(this.correctInRow);

            // Show success particles
            const correctZone = this.zoneFor(selectedDirection);
            this.showSuccessParticles(scene, correctZone.x, correctZone.y);

            // Check if we've reached 6 correct in a row
            if (this.correctInRow >= this.requiredCorrect) {
                // Success! Award coins
                this.delayedCall(scene, 500, () => {
                    const x = scene.cameras.main.width / 2;
                    const y = scene.cameras.main.height / 2;
                    this.finish(true, selectedDirection, x, y);
                });
            } else {
                // Correct but need more - just update UI and load next
                this.loadNextQuestion(scene);
            }
        } else {
            // Wrong answer - red shake, say the right side, then game over
            this.showWrongAnswerFeedback(scene, selectedDirection);
        }
    }

    loadNextQuestion(scene) {
        // Small delay before loading next question
        this.delayedCall(scene, 500, () => {
            // Clean up current UI
            this.cleanup(scene);

            // Generate new challenge
            this.generateChallenge();
            this.createChallengeUI(scene);
        });
    }

    showWrongAnswerFeedback(scene, selectedDirection) {
        const correctDirection = this.challengeData.correctDirection;

        // Track wrong answer
        trackWrongAnswer(
            'LeftRightMode',
            correctDirection,
            selectedDirection
        );

        this.isRevealing = true;

        // Red shake on the side that was tapped
        const wrongZone = this.zoneFor(selectedDirection);
        this.shakeWrong(scene, wrongZone, {
            restore: false,
            onComplete: () => {
                // Back to the neutral zone look
                if (wrongZone.scene) {
                    wrongZone.setFillStyle(COLORS.NEUTRAL_FILL, ZONE_ALPHA);
                    wrongZone.setStrokeStyle();
                }

                // Sad emoji - GAME OVER
                const sadEmoji = scene.add.text(scene.cameras.main.width / 2, 500, '😢', {
                    fontSize: '120px'
                }).setOrigin(0.5).setDepth(1000);
                this.uiElements.push(sadEmoji);
                this.addTween(scene, {
                    targets: sadEmoji,
                    alpha: 0,
                    scale: 1.5,
                    duration: 1500,
                    ease: 'Cubic.easeOut'
                });

                // Light up the correct side and say it, so the child hears
                // "höger" while looking at the right-hand half. Ask the same
                // direction again next time.
                const correctZone = this.zoneFor(correctDirection);
                if (correctZone && correctZone.scene) correctZone.setFillStyle(COLORS.REVEAL, 0.5);
                this.queueRetry(correctDirection);

                this.revealAnswer(scene, {
                    targets: [],
                    disable: [this.leftZone, this.rightZone],
                    audioKey: `direction_audio_${correctDirection}`,
                    delay: 1500,
                    onDone: () => this.endRound(scene)
                });
            }
        });
    }

    endRound(scene) {
        // GAME OVER - clean up and reload the scene to show dice again. This
        // mode does not rebuild a challenge (no restartChallenge), so it
        // resets the streak itself before the scene restarts.
        this.cleanup(scene);
        this.correctInRow = 0;
        resetStreak();
        if (scene.boosterBarElements) {
            updateBoosterBar(scene.boosterBarElements, 0, scene);
        }

        // Restart the scene (will show dice animation since no coins earned)
        scene.scene.restart();
    }

    cleanup(scene) {
        // Clear zone references
        this.leftZone = null;
        this.rightZone = null;

        super.cleanup(scene);
    }
}
