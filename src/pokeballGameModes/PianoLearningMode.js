import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { getRandomSong, PIANO_KEYS } from '../pianoSongs.js';

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
        this.noteMarkers = []; // Visual circles on piano keys

        // Default configuration (will be overridden by loadConfig)
        this.measuresPerPattern = 1;
        this.showNotes = true;
        this.configLoaded = false;
    }

    async loadConfig() {
        try {
            const response = await fetch('/config/minigames.json');
            if (response.ok) {
                const serverConfig = await response.json();
                const config = serverConfig.pianoLearning || {};
                // Patterns are whole measures: only a positive integer makes sense here
                // (0 would give infinitely many patterns, 1.5 would index between measures).
                const measures = Number(config.measuresPerPattern);
                this.measuresPerPattern = Number.isInteger(measures) && measures > 0 ? measures : 1;
                this.showNotes = config.showNotes !== false; // Default to true

                console.log('PianoLearningMode config loaded from server:', {
                    measuresPerPattern: this.measuresPerPattern,
                    showNotes: this.showNotes
                });
            } else {
                throw new Error('Config not found');
            }
        } catch (error) {
            console.warn('Failed to load server config, using defaults:', error);
            this.measuresPerPattern = 1;
            this.showNotes = true;
        }

        this.configLoaded = true;
    }

    generateChallenge() {
        // The scene awaits loadConfig() before calling us; if it didn't, the
        // constructor defaults apply. Kept synchronous so challengeData is
        // always set before createChallengeUI runs.

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

        return this.challengeData;
    }

    createChallengeUI(scene) {
        const width = scene.cameras.main.width;

        // A fresh challenge always starts accepting input again.
        this.inputLocked = false;
        this.isPlayingDemo = false;
        this.playerNotes = [];

        // Speaker button to replay current pattern (centered at top)
        const speakerBtn = scene.add.text(width / 2, 120, '🔊', {
            font: '64px Arial',
            padding: { y: 20 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        speakerBtn.on('pointerdown', () => {
            if (!this.isPlayingDemo && !this.inputLocked) {
                this.playCurrentPattern(scene);
            }
        });
        this.uiElements.push(speakerBtn);

        // No progress text needed - balls show progress visually

        // Create piano keyboard
        this.createPiano(scene);

        // Create ball indicators showing progress through patterns
        this.createBallIndicators(scene);

        // Create note markers (hidden initially, shown during playback)
        if (this.showNotes) {
            this.displayNoteMarkers(scene);
        }

        // Don't auto-play - wait for user to click speaker button
        // This avoids browser autoplay restrictions
    }

    createPiano(scene) {
        const width = scene.cameras.main.width;
        const height = scene.cameras.main.height;

        // Piano dimensions
        const whiteKeyWidth = 80;
        const whiteKeyHeight = 200;
        const blackKeyWidth = 50;
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
            keyRect.setData('note', keyData.note);

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
            keyRect.setData('note', keyData.note);

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

        this.ballIndicators = [];
        for (let i = 0; i < totalPatterns; i++) {
            const x = startX + i * (ballSize + spacing);
            const ball = scene.add.circle(x, y, ballSize / 2, 0xCCCCCC);
            ball.setStrokeStyle(2, 0x666666);
            this.ballIndicators.push(ball);
            this.uiElements.push(ball);
        }

        // Mark the current pattern from the start
        this.updateBallIndicators();
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

    displayNoteMarkers(scene) {
        // Clear existing markers
        this.noteMarkers.forEach(marker => marker.destroy());
        this.noteMarkers = [];

        // Get the notes for the current pattern (in order)
        const noteObjects = this.getCurrentPatternNotes();

        // Create circles for each note in sequence (not grouped by note name)
        noteObjects.forEach((noteObj, index) => {
            const note = noteObj.note;
            const keyInfo = this.pianoKeys[note];
            if (!keyInfo) return;

            const keyRect = keyInfo.graphic;

            // Circle properties
            const circleRadius = 8;
            const circleSpacing = 4;

            // Position circles near the bottom of the key
            const keyX = keyRect.x + (keyInfo.data.type === 'white' ? keyRect.width / 2 : 0);
            const keyY = keyRect.y + keyRect.height - 15; // 15px from bottom (smaller margin)

            // Count how many circles are already on this key
            const existingCirclesOnKey = this.noteMarkers.filter(m =>
                m.getData('note') === note
            ).length;

            // Stack circles vertically from bottom up
            const circleY = keyY - (existingCirclesOnKey * (circleRadius * 2 + circleSpacing));

            const circle = scene.add.circle(keyX, circleY, circleRadius, 0x999999); // Grey
            circle.setStrokeStyle(2, 0x666666);
            circle.setDepth(200); // Above piano keys
            circle.setAlpha(0); // Start hidden
            circle.setData('note', note);
            circle.setData('index', index); // Track order in sequence

            this.noteMarkers.push(circle);
            this.uiElements.push(circle);
        });
    }

    showNextMarker(index) {
        // Show the marker at the given index
        const marker = this.noteMarkers.find(m => m.getData('index') === index);
        if (marker) {
            marker.setAlpha(1);
        }
    }

    removeMarkerAt(index) {
        // Remove the marker for the note the player just played (by sequence
        // position, so it works whether or not the demo has revealed it yet)
        const marker = this.noteMarkers.find(m => m.getData('index') === index);
        if (marker) {
            marker.destroy();
            const i = this.noteMarkers.indexOf(marker);
            if (i > -1) {
                this.noteMarkers.splice(i, 1);
            }
            const u = this.uiElements.indexOf(marker);
            if (u > -1) {
                this.uiElements.splice(u, 1);
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

    // Wait using a mode-owned timer: after cleanup() the promise simply never
    // resolves, so an in-flight demo can't touch a torn-down keyboard.
    wait(scene, ms) {
        return new Promise(resolve => this.delayedCall(scene, ms, resolve));
    }

    async playNotes(scene, noteObjects, quarterNoteDuration, highlightColor) {
        for (let i = 0; i < noteObjects.length; i++) {
            const noteObj = noteObjects[i];
            const noteName = noteObj.note;
            const noteDurationMs = quarterNoteDuration * noteObj.duration;

            // Show the marker for this note (only meaningful while learning)
            if (this.showNotes) {
                this.showNextMarker(i);
            }

            // Highlight the key
            this.highlightKey(noteName, true, highlightColor);

            // Play the note
            const audio = this.audioCache[noteName];
            if (audio) {
                audio.play();
            }

            // Highlight stays on for 80% of the note duration
            await this.wait(scene, noteDurationMs * 0.8);
            this.highlightKey(noteName, false);

            // Small gap before next note (20% of note duration)
            if (i < noteObjects.length - 1) {
                await this.wait(scene, noteDurationMs * 0.2);
            }
        }
    }

    async playCurrentPattern(scene) {
        if (this.isPlayingDemo) return;
        this.isPlayingDemo = true;
        const noteObjects = this.getCurrentPatternNotes();

        const noteNames = noteObjects.map(n => n.note).join(', ');
        console.log(`Playing pattern ${this.currentPatternIndex + 1}: ${noteNames}`);

        // Base duration for a quarter note in milliseconds
        await this.playNotes(scene, noteObjects, 500, 0xFFFF00);

        this.isPlayingDemo = false;
        // The keyboard is answerable again once the pattern has been heard
        this.inputLocked = false;
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
        if (this.isPlayingDemo || this.inputLocked) return;

        console.log(`Player pressed: ${note}`);

        // Check if this is the correct note
        const expectedNotes = this.getCurrentPatternNotes();
        const expectedNote = expectedNotes[this.playerNotes.length]?.note;
        const isCorrectNote = (note === expectedNote);

        // Play the note either way (so they hear what they pressed)
        const audio = this.audioCache[note];
        if (audio) {
            audio.play();
        }

        if (isCorrectNote) {
            // Correct note! Remove marker and continue
            if (this.showNotes) {
                this.removeMarkerAt(this.playerNotes.length);
            }

            // Highlight the pressed key briefly
            this.highlightKey(note, true);
            this.delayedCall(scene, 300, () => {
                this.highlightKey(note, false);
            });

            // Add to player's notes for current pattern
            this.playerNotes.push(note);

            // Check if pattern is complete
            if (this.playerNotes.length >= expectedNotes.length) {
                this.checkPlayerAnswer(scene);
            }
        } else {
            // Wrong note! Show error immediately
            console.log(`Wrong note! Expected: ${expectedNote}, Got: ${note}`);

            // Highlight wrong key in red
            this.highlightKey(note, true, 0xFF0000);
            this.delayedCall(scene, 300, () => {
                this.highlightKey(note, false);
            });

            // Show error feedback immediately
            this.showErrorAndReplay(scene);
        }
    }

    showErrorAndReplay(scene) {
        // No taps count until the pattern has been replayed
        this.inputLocked = true;

        // Reset player notes
        this.playerNotes = [];

        // Reset markers - destroy and recreate them all
        if (this.showNotes) {
            this.displayNoteMarkers(scene);
        }

        // Visual feedback (flash screen red briefly)
        const width = scene.cameras.main.width;
        const height = scene.cameras.main.height;
        const errorFlash = scene.add.rectangle(0, 0, width, height, 0xFF0000, 0.3);
        errorFlash.setOrigin(0);
        errorFlash.setDepth(1000);
        this.uiElements.push(errorFlash);

        this.delayedCall(scene, 200, () => {
            errorFlash.destroy();
        });

        // Replay the current pattern after a moment (unlocks input when done)
        this.delayedCall(scene, 800, () => {
            this.playCurrentPattern(scene);
        });
    }

    checkPlayerAnswer(scene) {
        // This method is only called when the pattern is complete and all notes were correct
        // (errors are caught immediately in handleKeyPress)
        console.log(`Pattern complete! Player played: ${this.playerNotes.join(', ')}`);

        // Nothing is answerable until the next pattern has been played
        this.inputLocked = true;

        // Move to next pattern
        this.currentPatternIndex++;
        this.playerNotes = [];

        // Update progress
        this.updateBallIndicators();

        // Check if song is complete
        if (this.currentPatternIndex >= this.challengeData.totalPatterns) {
            // Song complete! Play entire melody then give reward
            this.delayedCall(scene, 500, async () => {
                await this.playEntireMelody(scene);
                this.finish(true, 'complete', scene.cameras.main.width / 2, scene.cameras.main.height / 2);
            });
        } else {
            // Update note markers for new pattern
            if (this.showNotes) {
                this.displayNoteMarkers(scene);
            }

            // Play next pattern after short delay (unlocks input when done)
            this.delayedCall(scene, 800, () => {
                this.playCurrentPattern(scene);
            });
        }
    }

    async playEntireMelody(scene) {
        console.log('Playing entire melody at 2x tempo!');
        this.isPlayingDemo = true;

        // Flatten all measures into a single array
        const allNotes = [];
        for (const measure of this.currentSong.measures) {
            allNotes.push(...measure);
        }

        // Quarter note at 2x tempo (500ms / 2), keys light up green
        await this.playNotes(scene, allNotes, 250, 0x4CAF50);

        this.isPlayingDemo = false;
    }

    cleanup(scene) {
        super.cleanup(scene);

        // Clean up audio
        Object.values(this.audioCache).forEach(audio => {
            if (audio) {
                audio.stop();
                if (audio.destroy) audio.destroy();
            }
        });
        this.audioCache = {};

        this.pianoKeys = {};
        this.ballIndicators = [];
        this.noteMarkers = [];
        this.progressText = null;
        this.isPlayingDemo = false;
    }
}
