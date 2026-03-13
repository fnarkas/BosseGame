import Phaser from 'phaser';
import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { getRandomSong, getPianoKey, PIANO_KEYS } from '../pianoSongs.js';

/**
 * Piano Learning Mode - Learn melodies by repeating notes in patterns
 * Game flow:
 * 1. Play pattern of notes (configurable count, default 3)
 * 2. Player repeats the notes
 * 3. If correct → next pattern
 * 4. If wrong → replay same pattern until correct
 * 5. When melody complete → play entire melody → reward
 */
export class PianoLearningMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.currentSong = null;
        this.currentPatternIndex = 0; // Which pattern we're on
        this.playerNotes = []; // Notes played by player for current pattern
        this.pianoKeys = {}; // Map of note name -> key graphics
        this.audioCache = {}; // Map of note name -> Phaser sound
        this.isPlayingDemo = false;
        this.ballIndicators = [];
        this.progressText = null;

        // Default configuration (will be overridden by loadConfig)
        this.measuresPerPattern = 1;
        this.configLoaded = false;
    }

    async loadConfig() {
        try {
            const response = await fetch('/config/minigames.json');
            if (response.ok) {
                const serverConfig = await response.json();
                const config = serverConfig.pianoLearning || { measuresPerPattern: 1 };
                this.measuresPerPattern = config.measuresPerPattern || 1;

                console.log('PianoLearningMode config loaded from server:', {
                    measuresPerPattern: this.measuresPerPattern
                });
            } else {
                throw new Error('Config not found');
            }
        } catch (error) {
            console.warn('Failed to load server config, using defaults:', error);
            this.measuresPerPattern = 1;
        }

        this.configLoaded = true;
    }

    async generateChallenge() {
        // Load config if not already loaded
        if (!this.configLoaded) {
            await this.loadConfig();
        }

        // Select a random song
        this.currentSong = getRandomSong();
        this.currentPatternIndex = 0;
        this.playerNotes = [];

        const totalMeasures = this.currentSong.measures.length;
        const totalPatterns = Math.ceil(totalMeasures / this.measuresPerPattern);

        console.log(`Selected song: ${this.currentSong.name}`);
        console.log(`Song has ${totalMeasures} measures (${totalPatterns} patterns of ${this.measuresPerPattern} measure(s) each)`);

        this.challengeData = {
            song: this.currentSong,
            totalPatterns: totalPatterns
        };
    }

    createChallengeUI(scene) {
        const width = scene.cameras.main.width;
        const height = scene.cameras.main.height;

        // Speaker button to replay current pattern (centered at top)
        const speakerBtn = scene.add.text(width / 2, 120, '🔊', {
            font: '64px Arial',
            padding: { y: 20 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        speakerBtn.on('pointerdown', () => {
            if (!this.isPlayingDemo) {
                this.playCurrentPattern(scene);
            }
        });
        this.uiElements.push(speakerBtn);

        // No progress text needed - balls show progress visually

        // Create piano keyboard
        this.createPiano(scene);

        // Create ball indicators showing progress through patterns
        this.createBallIndicators(scene);

        // Don't auto-play - wait for user to click speaker button
        // This avoids browser autoplay restrictions
    }

    createPiano(scene) {
        const width = scene.cameras.main.width;
        const height = scene.cameras.main.height;

        // Piano dimensions
        const whiteKeyWidth = 50;
        const whiteKeyHeight = 200;
        const blackKeyWidth = 30;
        const blackKeyHeight = 120;

        // Count white keys for centering
        const whiteKeys = PIANO_KEYS.filter(k => k.type === 'white');
        const totalWidth = whiteKeys.length * whiteKeyWidth;
        const startX = (width - totalWidth) / 2;
        const pianoY = height - 280;

        // Draw white keys first
        PIANO_KEYS.filter(k => k.type === 'white').forEach(keyData => {
            const x = startX + keyData.whiteIndex * whiteKeyWidth;
            const y = pianoY;

            // White key background
            const keyRect = scene.add.rectangle(x, y, whiteKeyWidth - 4, whiteKeyHeight, 0xFFFFFF);
            keyRect.setOrigin(0, 0);
            keyRect.setStrokeStyle(2, 0x000000);
            keyRect.setInteractive({ useHandCursor: true });

            // Store reference
            this.pianoKeys[keyData.note] = {
                graphic: keyRect,
                originalColor: 0xFFFFFF,
                data: keyData
            };

            // Click handler
            keyRect.on('pointerdown', () => this.handleKeyPress(scene, keyData.note));

            this.uiElements.push(keyRect);
        });

        // Draw black keys on top (positioned between white keys)
        PIANO_KEYS.filter(k => k.type === 'black').forEach(keyData => {
            // Black keys are positioned at the right edge of the white key they're associated with
            // This puts them between the white keys
            const x = startX + keyData.whiteIndex * whiteKeyWidth + whiteKeyWidth - 2;
            const y = pianoY;

            // Black key
            const keyRect = scene.add.rectangle(x, y, blackKeyWidth, blackKeyHeight, 0x000000);
            keyRect.setOrigin(0.5, 0);
            keyRect.setStrokeStyle(2, 0x333333);
            keyRect.setInteractive({ useHandCursor: true });
            keyRect.setDepth(100); // Above white keys

            // Store reference
            this.pianoKeys[keyData.note] = {
                graphic: keyRect,
                originalColor: 0x000000,
                data: keyData
            };

            // Click handler
            keyRect.on('pointerdown', () => this.handleKeyPress(scene, keyData.note));

            this.uiElements.push(keyRect);
        });

        // Load all audio
        PIANO_KEYS.forEach(keyData => {
            const audioKey = `piano-${keyData.note}`;
            if (scene.cache.audio.exists(audioKey)) {
                this.audioCache[keyData.note] = scene.sound.add(audioKey);
            }
        });
    }

    createBallIndicators(scene) {
        const width = scene.cameras.main.width;
        const totalPatterns = this.challengeData.totalPatterns;

        // Show one ball for each pattern (no limiting)
        const ballSize = 24;
        const spacing = 10;
        const totalWidth = totalPatterns * (ballSize + spacing);
        const startX = (width - totalWidth) / 2;
        const y = 200;

        for (let i = 0; i < totalPatterns; i++) {
            const x = startX + i * (ballSize + spacing);
            const ball = scene.add.circle(x, y, ballSize / 2, 0xCCCCCC);
            ball.setStrokeStyle(2, 0x666666);
            this.ballIndicators.push(ball);
            this.uiElements.push(ball);
        }
    }

    updateBallIndicators() {
        const totalPatterns = this.challengeData.totalPatterns;

        // Update ball colors based on progress
        for (let i = 0; i < totalPatterns; i++) {
            const ball = this.ballIndicators[i];
            if (!ball) continue;

            if (i < this.currentPatternIndex) {
                // Completed
                ball.setFillStyle(0x4CAF50); // Green
            } else if (i === this.currentPatternIndex) {
                // Current
                ball.setFillStyle(0xFFEB3B); // Yellow
            } else {
                // Not yet reached
                ball.setFillStyle(0xCCCCCC); // Gray
            }
        }
    }

    getCurrentPatternNotes() {
        // Get the measures for this pattern
        const startMeasure = this.currentPatternIndex * this.measuresPerPattern;
        const endMeasure = Math.min(startMeasure + this.measuresPerPattern, this.currentSong.measures.length);

        // Flatten measures into a single array of note objects
        const notes = [];
        for (let i = startMeasure; i < endMeasure; i++) {
            notes.push(...this.currentSong.measures[i]);
        }

        return notes; // Array of {note, duration} objects
    }

    async playCurrentPattern(scene) {
        this.isPlayingDemo = true;
        const noteObjects = this.getCurrentPatternNotes();

        const noteNames = noteObjects.map(n => n.note).join(', ');
        console.log(`Playing pattern ${this.currentPatternIndex + 1}: ${noteNames}`);

        // Base duration for a quarter note in milliseconds
        const quarterNoteDuration = 500;

        for (let i = 0; i < noteObjects.length; i++) {
            const noteObj = noteObjects[i];
            const noteName = noteObj.note;
            const duration = noteObj.duration;

            // Calculate actual duration based on note value
            const noteDurationMs = quarterNoteDuration * duration;

            // Highlight the key
            this.highlightKey(noteName, true);

            // Play the note
            const audio = this.audioCache[noteName];
            if (audio) {
                audio.play();
            }

            // Wait for note duration (highlight stays on for 80% of note duration)
            const highlightDuration = noteDurationMs * 0.8;
            await new Promise(resolve => {
                scene.time.delayedCall(highlightDuration, () => {
                    this.highlightKey(noteName, false);
                    resolve();
                });
            });

            // Small gap before next note (20% of note duration)
            const gapDuration = noteDurationMs * 0.2;
            if (i < noteObjects.length - 1) {
                await new Promise(resolve => scene.time.delayedCall(gapDuration, resolve));
            }
        }

        this.isPlayingDemo = false;
    }

    highlightKey(note, isHighlighted, color = 0xFFFF00) {
        const key = this.pianoKeys[note];
        if (!key) return;

        if (isHighlighted) {
            // Highlight in specified color (default yellow)
            key.graphic.setFillStyle(color);
        } else {
            // Reset to original color
            key.graphic.setFillStyle(key.originalColor);
        }
    }

    handleKeyPress(scene, note) {
        if (this.isPlayingDemo) return;

        console.log(`Player pressed: ${note}`);

        // Highlight the pressed key briefly
        this.highlightKey(note, true);

        // Play the note
        const audio = this.audioCache[note];
        if (audio) {
            audio.play();
        }

        // Reset highlight after a moment
        scene.time.delayedCall(300, () => {
            this.highlightKey(note, false);
        });

        // Add to player's notes for current pattern
        this.playerNotes.push(note);

        // Check if player has played enough notes for current pattern
        const expectedNotes = this.getCurrentPatternNotes();
        if (this.playerNotes.length >= expectedNotes.length) {
            this.checkPlayerAnswer(scene);
        }
    }

    checkPlayerAnswer(scene) {
        const expectedNoteObjects = this.getCurrentPatternNotes();
        const expectedNotes = expectedNoteObjects.map(n => n.note);
        const isCorrect = this.playerNotes.every((note, i) => note === expectedNotes[i]);

        console.log(`Player played: ${this.playerNotes.join(', ')}`);
        console.log(`Expected: ${expectedNotes.join(', ')}`);
        console.log(`Result: ${isCorrect ? 'CORRECT' : 'WRONG'}`);

        if (isCorrect) {
            // Move to next pattern
            this.currentPatternIndex++;
            this.playerNotes = [];

            // Update progress
            this.updateBallIndicators();

            // Check if song is complete
            if (this.currentPatternIndex >= this.challengeData.totalPatterns) {
                // Song complete! Play entire melody then give reward
                scene.time.delayedCall(500, async () => {
                    await this.playEntireMelody(scene);
                    this.answerCallback(true, 'complete', scene.cameras.main.width / 2, scene.cameras.main.height / 2);
                });
            } else {
                // Play next pattern after short delay
                scene.time.delayedCall(800, () => {
                    this.playCurrentPattern(scene);
                });
            }
        } else {
            // Wrong answer - reset and replay
            this.playerNotes = [];

            // Visual feedback (flash screen red briefly)
            const width = scene.cameras.main.width;
            const height = scene.cameras.main.height;
            const errorFlash = scene.add.rectangle(0, 0, width, height, 0xFF0000, 0.3);
            errorFlash.setOrigin(0);
            errorFlash.setDepth(1000);
            this.uiElements.push(errorFlash);

            scene.time.delayedCall(200, () => {
                errorFlash.destroy();
            });

            // Replay the current pattern after a moment
            scene.time.delayedCall(800, () => {
                this.playCurrentPattern(scene);
            });
        }
    }

    async playEntireMelody(scene) {
        console.log('Playing entire melody at 2x tempo!');
        this.isPlayingDemo = true;

        // Base duration for a quarter note at 2x tempo (half the normal speed)
        const quarterNoteDuration = 250; // 500ms / 2 = 250ms

        // Flatten all measures into a single array
        const allNotes = [];
        for (const measure of this.currentSong.measures) {
            allNotes.push(...measure);
        }

        for (let i = 0; i < allNotes.length; i++) {
            const noteObj = allNotes[i];
            const noteName = noteObj.note;
            const duration = noteObj.duration;

            // Calculate actual duration at 2x tempo
            const noteDurationMs = quarterNoteDuration * duration;

            // Highlight the key in GREEN
            this.highlightKey(noteName, true, 0x4CAF50); // Green color

            // Play the note
            const audio = this.audioCache[noteName];
            if (audio) {
                audio.play();
            }

            // Wait for note duration
            const highlightDuration = noteDurationMs * 0.8;
            await new Promise(resolve => {
                scene.time.delayedCall(highlightDuration, () => {
                    this.highlightKey(noteName, false);
                    resolve();
                });
            });

            // Small gap between notes
            const gapDuration = noteDurationMs * 0.2;
            if (i < allNotes.length - 1) {
                await new Promise(resolve => scene.time.delayedCall(gapDuration, resolve));
            }
        }

        this.isPlayingDemo = false;
    }

    cleanup(scene) {
        // Clean up all UI elements
        this.uiElements.forEach(element => {
            if (element && element.destroy) {
                element.destroy();
            }
        });
        this.uiElements = [];

        // Clean up audio
        Object.values(this.audioCache).forEach(audio => {
            if (audio) {
                audio.stop();
            }
        });
        this.audioCache = {};

        this.pianoKeys = {};
        this.ballIndicators = [];
        this.progressText = null;
    }
}
