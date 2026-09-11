import Phaser from 'phaser';
import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { trackWrongAnswer } from '../wrongAnswers.js';
import { resetStreak } from '../streak.js';
import { updateBoosterBar } from '../boosterBar.js';
import { loadModeConfig } from '../minigameConfig.js';
import { COLORS, drawDashedRect, updateZoneHover } from './uiKit.js';

// Swedish days of the week with their numbers
const DAYS_OF_WEEK = [
    { number: 1, name: 'Måndag', audio: 'day_1_mandag' },
    { number: 2, name: 'Tisdag', audio: 'day_2_tisdag' },
    { number: 3, name: 'Onsdag', audio: 'day_3_onsdag' },
    { number: 4, name: 'Torsdag', audio: 'day_4_torsdag' },
    { number: 5, name: 'Fredag', audio: 'day_5_fredag' },
    { number: 6, name: 'Lördag', audio: 'day_6_lordag' },
    { number: 7, name: 'Söndag', audio: 'day_7_sondag' }
];

const DEFAULT_CONFIG = { maxErrors: 3 };
const BOX_STROKE = 0x4A90E2;
const REVEAL_MS = 1000; // the correct zone glows while the day is spoken

export class DayMatchMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.correctMatches = 0;
        this.requiredMatches = 7; // Match all 7 days
        this.currentDays = [];
        this.dropZones = [];
        this.draggableBoxes = [];
        this.hasError = false;

        // Default config (will be loaded from server)
        this.config = { ...DEFAULT_CONFIG };
        this.configLoaded = false;
        this.errorsRemaining = this.config.maxErrors; // Will be set from config
    }

    async loadConfig() {
        this.config = await loadModeConfig('dayMatch', DEFAULT_CONFIG);
        if (!(this.config.maxErrors > 0)) this.config.maxErrors = DEFAULT_CONFIG.maxErrors;
        this.errorsRemaining = this.config.maxErrors;
        this.configLoaded = true;
        console.log('DayMatchMode loaded config:', this.config);
    }

    generateChallenge() {
        // Use all 7 days
        this.currentDays = [...DAYS_OF_WEEK];

        this.challengeData = {
            days: this.currentDays
        };
    }

    createChallengeUI(scene) {
        const width = scene.cameras.main.width;

        // A fresh challenge always starts accepting input again.
        this.isRevealing = false;
        this.inputLocked = false;
        this.hasError = false;

        // Show hearts at the top
        this.createHearts(scene, { max: this.config.maxErrors, remaining: this.errorsRemaining, y: 70 });

        // Create number drop zones at top
        const upperY = 220;
        const spacing = 140;
        const startX = width / 2 - (spacing * 3); // Center 7 items

        this.currentDays.forEach((day, index) => {
            const x = startX + index * spacing;

            // Drop zone background with dashed border
            const dropZone = scene.add.rectangle(x, upperY, 120, 120, COLORS.NEUTRAL_FILL, 0.2);
            dropZone.setInteractive();
            dropZone.setData('dayNumber', day.number);
            dropZone.setData('matched', false);
            dropZone.setData('originalAlpha', 0.2);
            this.dropZones.push(dropZone);
            this.uiElements.push(dropZone);

            // Create dashed border
            const graphics = scene.add.graphics();
            graphics.lineStyle(3, COLORS.OUTLINE, 1);
            const boxSize = 120;
            drawDashedRect(graphics, x - boxSize / 2, upperY - boxSize / 2, boxSize, boxSize, 8, 6);

            dropZone.setData('dashedBorder', graphics);
            this.uiElements.push(graphics);

            // Number in drop zone
            const numberText = scene.add.text(x, upperY, day.number.toString(), {
                fontSize: '80px',
                fontFamily: 'Arial',
                color: '#000000',
                fontStyle: 'bold'
            });
            numberText.setOrigin(0.5);
            dropZone.setData('numberText', numberText);
            this.uiElements.push(numberText);
        });

        // Create draggable day names at bottom - shuffled
        const lowerY = 520;
        const shuffledDays = Phaser.Utils.Array.Shuffle([...this.currentDays]);

        shuffledDays.forEach((day, index) => {
            const x = startX + index * spacing;

            // Solid box for draggable day name
            const box = scene.add.rectangle(x, lowerY, 120, 120, COLORS.NEUTRAL_FILL, 0.3);
            box.setStrokeStyle(3, BOX_STROKE); // Solid blue border
            box.setInteractive({ useHandCursor: true, draggable: true });
            box.setData('dayNumber', day.number);
            box.setData('dayName', day.name);
            box.setData('dayAudio', day.audio);
            box.setData('startX', x);
            box.setData('startY', lowerY);
            this.draggableBoxes.push(box);
            this.uiElements.push(box);

            // Day name text (NOT interactive - moves with box)
            const dayText = scene.add.text(x, lowerY, day.name, {
                fontSize: '28px',
                fontFamily: 'Arial',
                color: '#4A90E2',
                fontStyle: 'bold',
                align: 'center'
            });
            dayText.setOrigin(0.5);
            // Store reference to text in box
            box.setData('dayText', dayText);

            this.uiElements.push(dayText);

            // Set up drag events on the BOX
            box.on('drag', (pointer, dragX, dragY) => {
                if (this.isInputBlocked()) return; // Frozen while feedback is shown
                box.x = dragX;
                box.y = dragY;
                dayText.x = dragX;
                dayText.y = dragY;

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

    playDayAudio(scene, audioKey) {
        this.playAudio(scene, audioKey);
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

        const dayNumber = draggedBox.getData('dayNumber');
        const dayName = draggedBox.getData('dayName');
        const dayAudio = draggedBox.getData('dayAudio');
        const dayText = draggedBox.getData('dayText');
        let matched = false;
        let droppedOnWrongZone = false;
        let wrongZoneNumber = null;

        // Check if dropped on correct zone OR wrong zone
        this.dropZones.forEach(zone => {
            const zoneNumber = zone.getData('dayNumber');
            const alreadyMatched = zone.getData('matched');
            const bounds = zone.getBounds();

            // Check if day name is over this zone
            if (Phaser.Geom.Rectangle.Contains(bounds, pointer.x, pointer.y)) {
                if (!alreadyMatched && zoneNumber === dayNumber) {
                    // Correct match!
                    matched = true;
                    zone.setData('matched', true);

                    // Play the day audio
                    this.playDayAudio(scene, dayAudio);

                    // Snap to zone position
                    draggedBox.x = zone.x;
                    draggedBox.y = zone.y;
                    dayText.x = zone.x;
                    dayText.y = zone.y;

                    dayText.setTint(COLORS.CORRECT); // Green tint
                    draggedBox.setStrokeStyle(3, COLORS.CORRECT); // Green border
                    draggedBox.setFillStyle(COLORS.CORRECT, 0.2); // Light green fill
                    draggedBox.disableInteractive(); // Can't drag anymore

                    // Reset zone appearance and change to solid green border
                    zone.setFillStyle(COLORS.CORRECT, 0.2); // Light green fill
                    const dashedBorder = zone.getData('dashedBorder');
                    if (dashedBorder) {
                        dashedBorder.destroy(); // Remove dashed border
                    }
                    zone.setStrokeStyle(3, COLORS.CORRECT); // Solid green border

                    // Visual feedback animation
                    this.addTween(scene, {
                        targets: [draggedBox, dayText],
                        scale: 1.2,
                        duration: 200,
                        yoyo: true,
                        onComplete: () => {
                            // After animation, hide the dragged day name and box
                            draggedBox.setVisible(false);
                            dayText.setVisible(false);

                            // Update the drop zone text to show the day name instead of number
                            const numberText = zone.getData('numberText');
                            if (numberText && numberText.scene) {
                                numberText.setText(dayName);
                                numberText.setColor('#27AE60'); // Green color for matched text
                                numberText.setFontSize('28px'); // Smaller font for day name
                            }
                        }
                    });

                    this.correctMatches++;

                    // Check if all matched
                    if (this.correctMatches >= this.requiredMatches) {
                        // Success!
                        this.inputLocked = true;
                        this.delayedCall(scene, 800, () => {
                            const x = scene.cameras.main.width / 2;
                            const y = scene.cameras.main.height / 2;
                            this.finish(true, 'all-matched', x, y);
                        });
                    }
                } else if (!alreadyMatched) {
                    // Wrong zone! (day number doesn't match)
                    droppedOnWrongZone = true;
                    wrongZoneNumber = zoneNumber;
                }
            }
        });

        // Handle wrong drop or no drop
        if (!matched) {
            if (droppedOnWrongZone) {
                // Track wrong answer
                trackWrongAnswer(
                    'DayMatchMode',
                    dayName, // Correct day name
                    wrongZoneNumber.toString() // Wrong zone number
                );

                // Wrong zone - show error feedback. Freeze the other days
                // while the feedback plays so a second drop can't cost a
                // second heart or sneak in a match.
                this.isRevealing = true;
                this.inputLocked = true;
                this.showWrongDropFeedback(scene, draggedBox, dayText);
            } else {
                // Dropped outside all zones - just return to start
                this.addTween(scene, {
                    targets: [draggedBox, dayText],
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

    showWrongDropFeedback(scene, draggedBox, dayText) {
        // Lose a heart
        this.errorsRemaining = Math.max(0, this.errorsRemaining - 1);
        this.updateHearts(this.errorsRemaining);

        // A wrong answer breaks the streak (the round itself carries on, so
        // this mode resets it per error rather than in restartChallenge)
        resetStreak();
        if (scene.boosterBarElements) {
            updateBoosterBar(scene.boosterBarElements, 0, scene);
        }

        // Red flash and shake on the box and its text
        dayText.setTint(COLORS.WRONG);
        this.addTween(scene, {
            targets: dayText,
            x: dayText.x - 10,
            duration: 50,
            yoyo: true,
            repeat: 3
        });

        this.shakeWrong(scene, draggedBox, {
            restore: false,
            onComplete: () => {
                if (!draggedBox.scene) return;
                // Clear red tint
                dayText.clearTint();
                draggedBox.setStrokeStyle(3, BOX_STROKE); // Back to blue border
                draggedBox.setFillStyle(COLORS.NEUTRAL_FILL, 0.3); // Back to white fill

                // Return to start position while the right zone is shown
                this.addTween(scene, {
                    targets: [draggedBox, dayText],
                    x: draggedBox.getData('startX'),
                    y: draggedBox.getData('startY'),
                    duration: 300,
                    ease: 'Back.easeOut'
                });

                this.revealCorrectZone(scene, draggedBox);
            }
        });
    }

    revealCorrectZone(scene, draggedBox) {
        const dayNumber = draggedBox.getData('dayNumber');
        const zone = this.dropZones.find(z => z.getData('dayNumber') === dayNumber);

        // Gold glow on the number this day belongs to
        if (zone && zone.scene) {
            zone.setFillStyle(COLORS.REVEAL, 0.5);
            this.addTween(scene, {
                targets: zone,
                scaleX: 1.15,
                scaleY: 1.15,
                duration: 250,
                yoyo: true,
                repeat: 1,
                ease: 'Sine.easeInOut'
            });
        }

        // Say the day while the child looks at its number, then either carry
        // on (input unfrozen) or, with no hearts left, start a fresh round.
        this.revealAnswer(scene, {
            targets: [],
            audioKey: draggedBox.getData('dayAudio'),
            delay: REVEAL_MS,
            onDone: () => {
                if (zone && zone.scene && !zone.getData('matched')) {
                    zone.setFillStyle(COLORS.NEUTRAL_FILL, zone.getData('originalAlpha'));
                }
                if (this.errorsRemaining <= 0) {
                    this.handleGameOver(scene);
                } else {
                    this.isRevealing = false;
                    this.inputLocked = false;
                }
            }
        });
    }

    handleGameOver(scene) {
        console.log('💔 Game Over - All hearts lost!');

        // Fresh hearts, streak reset and a new round
        this.errorsRemaining = this.config.maxErrors;
        this.restartChallenge(scene);
    }

    cleanup(scene) {
        super.cleanup(scene);
        this.dropZones = [];
        this.draggableBoxes = [];
        this.correctMatches = 0;
    }
}
