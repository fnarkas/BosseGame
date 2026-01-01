import { BaseAnswerMode } from './BaseAnswerMode.js';

/**
 * Debug mode for testing Pokemon catching flow
 * Simple SUCCESS/FAIL buttons to trigger correct/incorrect answers
 */
export class DebugMode extends BaseAnswerMode {
    constructor() {
        super();
        this.uiElements = []; // Track UI elements for cleanup
    }

    generateChallenge(pokemon) {
        // No real challenge in debug mode
        this.challengeData = {
            pokemon: pokemon
        };

        return this.challengeData;
    }

    createChallengeUI(scene, attemptsLeft) {
        const width = scene.cameras.main.width;
        const height = scene.cameras.main.height;

        // Show attempts (hearts) - positioned above Pokemon with more margin
        const heartsText = '❤️'.repeat(attemptsLeft) + '🖤'.repeat(3 - attemptsLeft);
        this.attemptsDisplay = scene.add.text(width / 2, 70, heartsText, {
            font: '36px Arial'
        }).setOrigin(0.5);
        this.attemptsDisplay.setData('clearOnNewEncounter', true);
        this.uiElements.push(this.attemptsDisplay);

        // Debug mode title
        const titleText = scene.add.text(width / 2, 500, 'DEBUG MODE', {
            font: 'bold 48px Arial',
            fill: '#FF0000',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);
        titleText.setData('clearOnNewEncounter', true);
        this.uiElements.push(titleText);

        // Create SUCCESS button
        const successBtn = scene.add.rectangle(width / 2 - 150, 600, 200, 80, 0x4CAF50);
        successBtn.setStrokeStyle(4, 0x000000);
        successBtn.setInteractive({ useHandCursor: true });
        successBtn.setData('clearOnNewEncounter', true);
        this.uiElements.push(successBtn);

        const successText = scene.add.text(width / 2 - 150, 600, 'SUCCESS ✓', {
            font: 'bold 28px Arial',
            fill: '#FFFFFF'
        }).setOrigin(0.5);
        successText.setData('clearOnNewEncounter', true);
        this.uiElements.push(successText);

        successBtn.on('pointerover', () => {
            successBtn.setFillStyle(0x66BB6A);
        });

        successBtn.on('pointerout', () => {
            successBtn.setFillStyle(0x4CAF50);
        });

        successBtn.on('pointerdown', () => {
            if (this.answerCallback) {
                this.answerCallback(true); // Always correct
            }
        });

        // Create FAIL button
        const failBtn = scene.add.rectangle(width / 2 + 150, 600, 200, 80, 0xF44336);
        failBtn.setStrokeStyle(4, 0x000000);
        failBtn.setInteractive({ useHandCursor: true });
        failBtn.setData('clearOnNewEncounter', true);
        this.uiElements.push(failBtn);

        const failText = scene.add.text(width / 2 + 150, 600, 'FAIL ✗', {
            font: 'bold 28px Arial',
            fill: '#FFFFFF'
        }).setOrigin(0.5);
        failText.setData('clearOnNewEncounter', true);
        this.uiElements.push(failText);

        failBtn.on('pointerover', () => {
            failBtn.setFillStyle(0xE57373);
        });

        failBtn.on('pointerout', () => {
            failBtn.setFillStyle(0xF44336);
        });

        failBtn.on('pointerdown', () => {
            if (this.answerCallback) {
                this.answerCallback(false); // Always incorrect
            }
        });
    }

    updateUI(scene, attemptsLeft, usedData) {
        // Just update hearts display
        const heartsText = '❤️'.repeat(attemptsLeft) + '🖤'.repeat(3 - attemptsLeft);
        this.attemptsDisplay.setText(heartsText);
    }

    checkAnswer(answer) {
        // In debug mode, the buttons directly call the callback
        // This method is not used, but required by base class
        return answer;
    }

    cleanup(scene) {
        // Destroy all UI elements
        this.uiElements.forEach(element => {
            if (element && element.destroy) {
                element.destroy();
            }
        });
        this.uiElements = [];
        this.attemptsDisplay = null;
    }

    getUsedData() {
        return {}; // No used data in debug mode
    }
}
