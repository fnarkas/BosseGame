import Phaser from 'phaser';
import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { SWEDISH_LETTERS, getConfiguredLetters } from '../letterData.js';
import { trackWrongAnswer } from '../wrongAnswers.js';
import { pickAdaptive, pickDistractors, HARD_LETTERS } from '../adaptive.js';
import { COLORS, drawDashedRect, updateZoneHover } from './uiKit.js';

const MODE_NAME = 'LetterDragMatchMode';
const BOX_STROKE = 0x4A90E2;
const LETTERS_PER_ROUND = 4;

export class LetterDragMatchMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.correctMatches = 0;
        this.requiredMatches = LETTERS_PER_ROUND; // Match all 4 letters
        this.currentLetters = [];
        this.dropZones = [];
        this.draggableLetters = [];
        this.draggableBoxes = []; // Store boxes for draggable letters
        this.hasError = false; // Track if player made an error
        // The admin-configured letters; all letters until the config is loaded
        this.availableLetters = [...SWEDISH_LETTERS];
        this.configLoaded = false;
    }

    async loadConfig() {
        const configured = await getConfiguredLetters();
        // A round needs 4 different letters; with fewer configured, use them all
        this.availableLetters = configured.length >= LETTERS_PER_ROUND ? configured : [...SWEDISH_LETTERS];
        this.configLoaded = true;
    }

    generateChallenge() {
        // The letter the child just missed is always in the next round;
        // otherwise favour the letters he mixes up. The other three are its
        // confusable partners first (b with d), then random fillers.
        const pool = this.availableLetters;
        const retry = this.takeRetry();
        const target = retry && pool.includes(retry)
            ? retry
            : pickAdaptive(MODE_NAME, pool, { seedList: HARD_LETTERS });
        const others = pickDistractors(MODE_NAME, target, pool, LETTERS_PER_ROUND - 1);
        this.currentLetters = Phaser.Utils.Array.Shuffle([target, ...others]);

        this.challengeData = {
            letters: this.currentLetters
        };
    }

    createChallengeUI(scene) {
        const width = scene.cameras.main.width;

        // A fresh challenge always starts accepting input again.
        this.inputLocked = false;
        this.isRevealing = false;
        this.hasError = false;

        // Create uppercase letters (drop zones) at top
        const upperY = 250;
        const spacing = 200;
        const startX = width / 2 - (spacing * 1.5);

        this.currentLetters.forEach((letter, index) => {
            const x = startX + index * spacing;

            // Drop zone background with dashed border
            const dropZone = scene.add.rectangle(x, upperY, 150, 150, COLORS.NEUTRAL_FILL, 0.2);
            dropZone.setInteractive();
            dropZone.setData('letter', letter);
            dropZone.setData('matched', false);
            dropZone.setData('originalAlpha', 0.2);
            this.dropZones.push(dropZone);
            this.uiElements.push(dropZone);

            // Create dashed border using graphics
            const graphics = scene.add.graphics();
            graphics.lineStyle(4, COLORS.OUTLINE, 1);
            const boxSize = 150;
            drawDashedRect(graphics, x - boxSize / 2, upperY - boxSize / 2, boxSize, boxSize, 10, 8);

            dropZone.setData('dashedBorder', graphics);
            this.uiElements.push(graphics);

            // Uppercase letter in drop zone
            const upperText = scene.add.text(x, upperY, letter.toUpperCase(), {
                fontSize: '96px',
                fontFamily: 'Arial',
                color: '#000000',
                fontStyle: 'bold'
            });
            upperText.setOrigin(0.5);
            upperText.setData('initialText', letter.toUpperCase());
            dropZone.setData('upperText', upperText);
            this.uiElements.push(upperText);
        });

        // Create lowercase letters (draggable) at bottom - shuffled
        const lowerY = 550;
        const shuffledLetters = Phaser.Utils.Array.Shuffle([...this.currentLetters]);

        shuffledLetters.forEach((letter, index) => {
            const x = startX + index * spacing;

            // Solid box for draggable letter - make THIS draggable, not the text
            const box = scene.add.rectangle(x, lowerY, 150, 150, COLORS.NEUTRAL_FILL, 0.3);
            box.setStrokeStyle(4, BOX_STROKE); // Solid blue border
            box.setInteractive({ useHandCursor: true, draggable: true }); // Make box draggable
            box.setData('letter', letter);
            box.setData('startX', x);
            box.setData('startY', lowerY);
            this.draggableBoxes.push(box);
            this.uiElements.push(box);

            // Lowercase letter (NOT interactive - moves with box)
            const lowerText = scene.add.text(x, lowerY, letter.toLowerCase(), {
                fontSize: '96px',
                fontFamily: 'Arial',
                color: '#4A90E2',
                fontStyle: 'bold'
            });
            lowerText.setOrigin(0.5);
            // Store reference to text in box
            box.setData('letterText', lowerText);

            this.draggableLetters.push(lowerText);
            this.uiElements.push(lowerText);

            // Set up drag events on the BOX
            box.on('drag', (pointer, dragX, dragY) => {
                if (this.isInputBlocked()) return; // Frozen while the answer is shown
                box.x = dragX;
                box.y = dragY;
                lowerText.x = dragX;
                lowerText.y = dragY;

                // Highlight the zone under the pointer
                updateZoneHover(this.dropZones, pointer);
            });

            box.on('dragend', (pointer) => {
                this.handleDrop(scene, box, pointer);
            });
        });

        // Enable drag and drop on boxes
        scene.input.setDraggable(this.draggableBoxes);
    }

    playLetterAudio(scene, letter) {
        this.playAudio(scene, `letter_audio_${letter.toLowerCase()}`);
    }

    resetZoneHover() {
        this.dropZones.forEach(zone => {
            if (!zone.getData('matched')) {
                zone.setFillStyle(COLORS.NEUTRAL_FILL, zone.getData('originalAlpha'));
            }
        });
    }

    handleDrop(scene, draggedBox, pointer) {
        // Don't allow drops during reveal animation
        if (this.isInputBlocked()) return;

        const letter = draggedBox.getData('letter');
        const letterText = draggedBox.getData('letterText');
        let matched = false;
        let droppedOnWrongZone = false;
        let wrongZoneLetter = null;

        // Check if dropped on correct zone OR wrong zone
        this.dropZones.forEach(zone => {
            const zoneLetter = zone.getData('letter');
            const alreadyMatched = zone.getData('matched');
            const bounds = zone.getBounds();

            // Check if letter is over this zone
            if (Phaser.Geom.Rectangle.Contains(bounds, pointer.x, pointer.y)) {
                if (!alreadyMatched && zoneLetter === letter) {
                    // Correct match!
                    matched = true;
                    zone.setData('matched', true);

                    // Play the letter audio
                    this.playLetterAudio(scene, letter);

                    // Snap to zone position
                    draggedBox.x = zone.x;
                    draggedBox.y = zone.y;
                    letterText.x = zone.x;
                    letterText.y = zone.y;

                    letterText.setTint(COLORS.CORRECT); // Green tint
                    draggedBox.setStrokeStyle(4, COLORS.CORRECT); // Green border
                    draggedBox.setFillStyle(COLORS.CORRECT, 0.2); // Light green fill
                    draggedBox.disableInteractive(); // Can't drag anymore

                    // Reset zone appearance and change to solid green border
                    zone.setFillStyle(COLORS.CORRECT, 0.2); // Light green fill
                    const dashedBorder = zone.getData('dashedBorder');
                    if (dashedBorder) {
                        dashedBorder.destroy(); // Remove dashed border
                    }
                    zone.setStrokeStyle(4, COLORS.CORRECT); // Solid green border

                    // Visual feedback animation
                    this.addTween(scene, {
                        targets: [draggedBox, letterText],
                        scale: 1.2,
                        duration: 200,
                        yoyo: true,
                        onComplete: () => {
                            // After animation, hide the dragged letter and box
                            draggedBox.setVisible(false);
                            letterText.setVisible(false);

                            // Update the drop zone text to show both uppercase and lowercase
                            const upperText = zone.getData('upperText');
                            if (upperText && upperText.scene) {
                                upperText.setText(`${letter.toUpperCase()}${letter.toLowerCase()}`);
                                upperText.setColor('#27AE60'); // Green color for matched text
                            }
                        }
                    });

                    this.correctMatches++;

                    // Check if all matched
                    if (this.correctMatches >= this.requiredMatches) {
                        // Success!
                        this.delayedCall(scene, 800, () => {
                            const x = scene.cameras.main.width / 2;
                            const y = scene.cameras.main.height / 2;
                            this.finish(true, 'all-matched', x, y);
                        });
                    }
                } else if (!alreadyMatched) {
                    // Wrong zone! (letter doesn't match)
                    droppedOnWrongZone = true;
                    wrongZoneLetter = zoneLetter.toLowerCase();
                }
            }
        });

        // Handle wrong drop or no drop
        if (!matched) {
            if (droppedOnWrongZone) {
                // Track wrong answer - player confused letter with wrongZoneLetter
                trackWrongAnswer(
                    MODE_NAME,
                    letter, // Correct letter (lowercase)
                    wrongZoneLetter // Wrong zone letter (lowercase)
                );

                // Wrong zone - show error feedback. Freeze the other letters
                // right away: one error ends this round.
                this.inputLocked = true;
                this.isRevealing = true;
                this.showWrongDropFeedback(scene, draggedBox, letterText);
            } else {
                // Dropped outside all zones - just return to start
                this.addTween(scene, {
                    targets: [draggedBox, letterText],
                    x: draggedBox.getData('startX'),
                    y: draggedBox.getData('startY'),
                    duration: 300,
                    ease: 'Back.easeOut'
                });
            }

            // Reset any hover effects
            this.resetZoneHover();
        }
    }

    showWrongDropFeedback(scene, draggedBox, letterText) {
        // Red flash on the letter; the box is shaken (and painted red) by
        // shakeWrong, the text shakes along with it.
        letterText.setTint(COLORS.WRONG);
        this.addTween(scene, {
            targets: letterText,
            x: letterText.x - 10,
            duration: 50,
            yoyo: true,
            repeat: 3
        });

        this.shakeWrong(scene, draggedBox, {
            restore: false,
            onComplete: () => {
                if (!draggedBox.scene) return;
                // Clear red tint
                letterText.clearTint();
                draggedBox.setStrokeStyle(4, BOX_STROKE); // Back to blue border
                draggedBox.setFillStyle(COLORS.NEUTRAL_FILL, 0.3); // Back to white fill

                // Return to start position
                this.addTween(scene, {
                    targets: [draggedBox, letterText],
                    x: draggedBox.getData('startX'),
                    y: draggedBox.getData('startY'),
                    duration: 300,
                    ease: 'Back.easeOut',
                    onComplete: () => {
                        // ONE ERROR = GAME OVER
                        // Highlight and say the correct zone for this letter
                        this.highlightCorrectZone(scene, draggedBox.getData('letter'));
                    }
                });
            }
        });
    }

    highlightCorrectZone(scene, letter) {
        // Find the correct drop zone for this letter
        const correctZone = this.dropZones.find(zone => zone.getData('letter') === letter);

        // Replace the dashed border with the solid pulsing gold one
        const dashedBorder = correctZone && correctZone.getData('dashedBorder');
        if (dashedBorder && dashedBorder.scene) {
            dashedBorder.destroy();
        }

        // The missed letter is in the next round, and in one more a bit later
        this.queueRetry(letter);
        this.queueRetry(letter, 2);

        // Gold pulse on the right zone while the letter is spoken; after 2
        // seconds the streak is reset and a new round starts.
        this.revealAnswer(scene, {
            targets: correctZone ? [correctZone] : [],
            disable: this.draggableBoxes,
            audioKey: `letter_audio_${letter.toLowerCase()}`
        });
    }

    cleanup(scene) {
        super.cleanup(scene);
        this.dropZones = [];
        this.draggableLetters = [];
        this.draggableBoxes = [];
        this.correctMatches = 0;
    }
}
