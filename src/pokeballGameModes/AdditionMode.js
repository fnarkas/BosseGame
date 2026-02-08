import { BasePokeballGameMode } from './BasePokeballGameMode.js';

/**
 * Addition game mode
 * Player solves simple addition problems by dragging digits
 * Configurable: number of terms, maximum sum, and whether only one term can have multiple digits
 */
export class AdditionMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.correctInRow = 0;
        this.requiredCorrect = 3;
        this.ballIndicators = [];

        // Drag-and-drop elements
        this.tensZone = null;
        this.onesZone = null;
        this.digitBoxes = [];
        this.isRevealing = false;

        // Default settings (will be loaded from config)
        this.numberOfTerms = 2;
        this.maxSum = 99;
        this.onlyOneMultiDigit = true;
        this.configLoaded = false;
    }

    async loadConfig() {
        try {
            const response = await fetch('/config/minigames.json');
            if (response.ok) {
                const config = await response.json();
                if (config.addition) {
                    this.numberOfTerms = config.addition.numberOfTerms || 2;
                    this.maxSum = config.addition.maxSum || 99;
                    this.onlyOneMultiDigit = config.addition.onlyOneMultiDigit !== false;
                }
            }
        } catch (error) {
            console.warn('Failed to load addition config, using defaults:', error);
        }
        this.configLoaded = true;
        console.log('AdditionMode loaded with settings:', {
            numberOfTerms: this.numberOfTerms,
            maxSum: this.maxSum,
            onlyOneMultiDigit: this.onlyOneMultiDigit
        });
    }

    generateChallenge() {
        const terms = [];
        let sum = 0;
        let multiDigitCount = 0;

        // Generate terms based on configuration
        for (let i = 0; i < this.numberOfTerms; i++) {
            let term;
            const remainingTerms = this.numberOfTerms - i - 1;
            const maxPossibleTerm = this.maxSum - sum - remainingTerms;

            if (maxPossibleTerm <= 0) {
                term = 0;
            } else if (this.onlyOneMultiDigit && multiDigitCount > 0) {
                // Only single digits allowed from now on
                term = Phaser.Math.Between(0, Math.min(9, maxPossibleTerm));
            } else if (this.onlyOneMultiDigit && i === this.numberOfTerms - 1 && multiDigitCount === 0) {
                // Last term and we haven't had a multi-digit yet, force one
                term = Phaser.Math.Between(10, Math.min(maxPossibleTerm, this.maxSum));
                multiDigitCount++;
            } else {
                // Generate any valid term
                const maxTermValue = Math.min(maxPossibleTerm, this.maxSum);
                if (this.onlyOneMultiDigit && multiDigitCount === 0) {
                    // Randomly decide if this should be the multi-digit term
                    const shouldBeMultiDigit = Math.random() < 0.5 && maxTermValue >= 10;
                    if (shouldBeMultiDigit) {
                        term = Phaser.Math.Between(10, maxTermValue);
                        multiDigitCount++;
                    } else {
                        term = Phaser.Math.Between(0, Math.min(9, maxTermValue));
                    }
                } else {
                    term = Phaser.Math.Between(0, maxTermValue);
                    if (term >= 10) multiDigitCount++;
                }
            }

            terms.push(term);
            sum += term;
        }

        const correctAnswer = sum;

        this.challengeData = {
            terms: terms,
            correctAnswer: correctAnswer,
            tens: Math.floor(correctAnswer / 10),
            ones: correctAnswer % 10
        };

        return this.challengeData;
    }

    createChallengeUI(scene) {
        const width = scene.cameras.main.width;
        const height = scene.cameras.main.height;

        // Display the addition problem at the top
        const problemText = this.challengeData.terms.join(' + ') + ' = ?';
        const problemDisplay = scene.add.text(width / 2, 180, problemText, {
            font: 'bold 64px Arial',
            fill: '#2C3E50'
        }).setOrigin(0.5);
        this.uiElements.push(problemDisplay);

        // Create two drop zones for tens and ones (side by side)
        const dropZoneY = 320;
        const dropZoneSize = 120;
        const dropZoneSpacing = 20;

        // Tens place (left)
        this.tensZone = scene.add.rectangle(
            width / 2 - dropZoneSize / 2 - dropZoneSpacing / 2,
            dropZoneY,
            dropZoneSize,
            dropZoneSize,
            0xFFFFFF,
            0.2
        );
        this.tensZone.setStrokeStyle(4, 0x000000, 1);
        this.tensZone.setInteractive();
        this.tensZone.setData('value', null);
        this.tensZone.setData('place', 'tens');
        this.uiElements.push(this.tensZone);

        // Tens label
        const tensLabel = scene.add.text(
            this.tensZone.x,
            this.tensZone.y,
            '',
            {
                fontSize: '72px',
                fontFamily: 'Arial',
                color: '#000000',
                fontStyle: 'bold'
            }
        );
        tensLabel.setOrigin(0.5);
        this.tensZone.setData('label', tensLabel);
        this.uiElements.push(tensLabel);

        // Ones place (right)
        this.onesZone = scene.add.rectangle(
            width / 2 + dropZoneSize / 2 + dropZoneSpacing / 2,
            dropZoneY,
            dropZoneSize,
            dropZoneSize,
            0xFFFFFF,
            0.2
        );
        this.onesZone.setStrokeStyle(4, 0x000000, 1);
        this.onesZone.setInteractive();
        this.onesZone.setData('value', null);
        this.onesZone.setData('place', 'ones');
        this.uiElements.push(this.onesZone);

        // Ones label
        const onesLabel = scene.add.text(
            this.onesZone.x,
            this.onesZone.y,
            '',
            {
                fontSize: '72px',
                fontFamily: 'Arial',
                color: '#000000',
                fontStyle: 'bold'
            }
        );
        onesLabel.setOrigin(0.5);
        this.onesZone.setData('label', onesLabel);
        this.uiElements.push(onesLabel);

        // Create ball indicators showing progress
        this.createBallIndicators(scene);

        // Create digit boxes (0-9) at bottom in 2 rows of 5
        this.createDigitBoxes(scene);
    }

    createBallIndicators(scene) {
        const width = scene.cameras.main.width;
        const startX = width / 2 - ((this.requiredCorrect - 1) * 60) / 2;
        const y = 470;
        const spacing = 60;

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

    createDigitBoxes(scene) {
        const width = scene.cameras.main.width;
        const boxSize = 80;
        const spacing = 20;
        const cols = 5;
        const startY = 580;
        const rowSpacing = 20;

        // Calculate starting X to center the grid
        const gridWidth = cols * boxSize + (cols - 1) * spacing;
        const startX = (width - gridWidth) / 2 + boxSize / 2;

        for (let digit = 0; digit <= 9; digit++) {
            const row = Math.floor(digit / cols);
            const col = digit % cols;
            const x = startX + col * (boxSize + spacing);
            const y = startY + row * (boxSize + rowSpacing);

            // Create draggable box for digit
            const box = scene.add.rectangle(x, y, boxSize, boxSize, 0xFFFFFF);
            box.setStrokeStyle(4, 0x3498DB);
            box.setInteractive({ useHandCursor: true });
            scene.input.setDraggable(box);
            box.setData('digit', digit);
            box.setData('originalX', x);
            box.setData('originalY', y);
            this.uiElements.push(box);

            // Digit text
            const digitText = scene.add.text(x, y, digit.toString(), {
                fontSize: '48px',
                fontFamily: 'Arial',
                color: '#2C3E50',
                fontStyle: 'bold'
            });
            digitText.setOrigin(0.5);
            box.setData('text', digitText);
            this.uiElements.push(digitText);

            this.digitBoxes.push({ box, digitText, digit });
        }

        // Set up drag and drop handlers
        scene.input.on('drag', (pointer, gameObject, dragX, dragY) => {
            if (this.isRevealing) return;

            gameObject.x = dragX;
            gameObject.y = dragY;

            // Move associated text
            const text = gameObject.getData('text');
            if (text) {
                text.x = dragX;
                text.y = dragY;
            }
        });

        scene.input.on('dragend', (pointer, gameObject) => {
            if (this.isRevealing) return;

            const digit = gameObject.getData('digit');

            // Check if dropped on tens zone
            if (Phaser.Geom.Intersects.RectangleToRectangle(gameObject.getBounds(), this.tensZone.getBounds())) {
                this.placeDigitInZone(gameObject, this.tensZone, digit);
            }
            // Check if dropped on ones zone
            else if (Phaser.Geom.Intersects.RectangleToRectangle(gameObject.getBounds(), this.onesZone.getBounds())) {
                this.placeDigitInZone(gameObject, this.onesZone, digit);
            }
            // Return to original position
            else {
                this.returnDigitToOriginal(gameObject);
            }

            // Check if answer is complete
            this.checkAnswer();
        });
    }

    placeDigitInZone(digitBox, zone, digit) {
        // If zone already has a digit, return it to original position
        const currentDigit = zone.getData('occupyingBox');
        if (currentDigit) {
            this.returnDigitToOriginal(currentDigit);
        }

        // Place new digit in zone
        digitBox.x = zone.x;
        digitBox.y = zone.y;
        const text = digitBox.getData('text');
        if (text) {
            text.x = zone.x;
            text.y = zone.y;
        }

        zone.setData('value', digit);
        zone.setData('occupyingBox', digitBox);

        // Update label
        const label = zone.getData('label');
        if (label) {
            label.setText(digit.toString());
        }
    }

    returnDigitToOriginal(digitBox) {
        const originalX = digitBox.getData('originalX');
        const originalY = digitBox.getData('originalY');

        digitBox.x = originalX;
        digitBox.y = originalY;

        const text = digitBox.getData('text');
        if (text) {
            text.x = originalX;
            text.y = originalY;
        }

        // Clear any zone that had this box
        if (this.tensZone.getData('occupyingBox') === digitBox) {
            this.tensZone.setData('value', null);
            this.tensZone.setData('occupyingBox', null);
            this.tensZone.getData('label').setText('');
        }
        if (this.onesZone.getData('occupyingBox') === digitBox) {
            this.onesZone.setData('value', null);
            this.onesZone.setData('occupyingBox', null);
            this.onesZone.getData('label').setText('');
        }
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

    checkAnswer() {
        const tensValue = this.tensZone.getData('value');
        const onesValue = this.onesZone.getData('value');

        // Both zones must be filled
        if (tensValue === null || onesValue === null) {
            return;
        }

        const playerAnswer = tensValue * 10 + onesValue;
        const correctAnswer = this.challengeData.correctAnswer;

        if (playerAnswer === correctAnswer) {
            // Correct!
            this.handleCorrectAnswer();
        } else {
            // Wrong answer
            this.handleWrongAnswer();
        }
    }

    handleCorrectAnswer() {
        this.correctInRow++;
        this.updateBallIndicators();

        // Flash zones green
        this.tensZone.setFillStyle(0x27AE60, 0.5);
        this.onesZone.setFillStyle(0x27AE60, 0.5);

        // Get the scene from one of the UI elements
        const scene = this.tensZone.scene;

        // Check if won
        if (this.correctInRow >= this.requiredCorrect) {
            // Player got 3 in a row! Give Pokemon
            scene.time.delayedCall(500, () => {
                if (this.answerCallback) {
                    this.answerCallback(true, this.challengeData.correctAnswer, this.onesZone.x, this.onesZone.y);
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

    handleWrongAnswer() {
        this.isRevealing = true;
        this.correctInRow = 0;
        this.updateBallIndicators();

        // Flash zones red
        this.tensZone.setFillStyle(0xFF0000, 0.5);
        this.onesZone.setFillStyle(0xFF0000, 0.5);

        // Get the scene from one of the UI elements
        const scene = this.tensZone.scene;

        // Shake animation on both zones
        const tensOriginalX = this.tensZone.x;
        const onesOriginalX = this.onesZone.x;

        scene.tweens.add({
            targets: [this.tensZone, this.tensZone.getData('label')],
            x: tensOriginalX - 10,
            duration: 50,
            yoyo: true,
            repeat: 3,
            onComplete: () => {
                this.tensZone.x = tensOriginalX;
                this.tensZone.getData('label').x = tensOriginalX;
            }
        });

        scene.tweens.add({
            targets: [this.onesZone, this.onesZone.getData('label')],
            x: onesOriginalX - 10,
            duration: 50,
            yoyo: true,
            repeat: 3,
            onComplete: () => {
                this.onesZone.x = onesOriginalX;
                this.onesZone.getData('label').x = onesOriginalX;

                // Show correct answer after shake
                this.showCorrectAnswer(scene);
            }
        });
    }

    showCorrectAnswer(scene) {
        // Reset zones to white
        this.tensZone.setFillStyle(0xFFFFFF, 0.2);
        this.onesZone.setFillStyle(0xFFFFFF, 0.2);

        // Return current digits to original positions
        const tensBox = this.tensZone.getData('occupyingBox');
        const onesBox = this.onesZone.getData('occupyingBox');

        if (tensBox) this.returnDigitToOriginal(tensBox);
        if (onesBox) this.returnDigitToOriginal(onesBox);

        // Find and place correct digits
        const correctTens = this.challengeData.tens;
        const correctOnes = this.challengeData.ones;

        // Find digit boxes for correct answer
        const tensDigitBox = this.digitBoxes.find(d => d.digit === correctTens);
        const onesDigitBox = this.digitBoxes.find(d => d.digit === correctOnes);

        if (tensDigitBox) {
            this.placeDigitInZone(tensDigitBox.box, this.tensZone, correctTens);
        }
        if (onesDigitBox) {
            this.placeDigitInZone(onesDigitBox.box, this.onesZone, correctOnes);
        }

        // Flash zones gold to show correct answer
        this.tensZone.setFillStyle(0xFFD700, 0.5);
        this.onesZone.setFillStyle(0xFFD700, 0.5);

        // Pulse animation
        scene.tweens.add({
            targets: [this.tensZone, this.onesZone],
            scaleX: 1.1,
            scaleY: 1.1,
            duration: 500,
            yoyo: true,
            repeat: 3,
            ease: 'Sine.easeInOut'
        });

        // After 2 seconds, restart with new challenge
        scene.time.delayedCall(2000, () => {
            this.isRevealing = false;
            this.cleanup(scene);
            this.generateChallenge();
            this.createChallengeUI(scene);
        });
    }

    cleanup(scene) {
        // Remove drag and drop listeners
        scene.input.off('drag');
        scene.input.off('dragend');

        // Destroy all UI elements
        this.uiElements.forEach(element => {
            if (element && element.destroy) {
                element.destroy();
            }
        });
        this.uiElements = [];
        this.digitBoxes = [];
        this.ballIndicators = [];
        this.tensZone = null;
        this.onesZone = null;
        this.isRevealing = false;
    }
}
