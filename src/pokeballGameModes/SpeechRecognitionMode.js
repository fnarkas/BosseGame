import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { getRandomWord } from '../speechVocabulary.js';
import { trackWrongAnswer } from '../wrongAnswers.js';

// ⚙️ CONFIGURATION: How many words must be read correctly to win
const REQUIRED_CORRECT_WORDS = 1; // Change this number: 1 = easy, 3 = medium, 5 = hard

/**
 * Speech Recognition Reading game mode
 * Player sees a Swedish word, reads it aloud, and system validates pronunciation
 */
export class SpeechRecognitionMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.currentWord = null;
        this.recognition = null;
        this.isListening = false;
        this.micButton = null;
        this.statusText = null;
        this.correctCount = 0;
        this.requiredCorrect = REQUIRED_CORRECT_WORDS; // Configurable requirement
        this.ballIndicators = [];
    }

    generateChallenge() {
        // Get random Swedish word
        this.currentWord = getRandomWord('easy'); // Start with easy words

        this.challengeData = {
            word: this.currentWord.word,
            translation: this.currentWord.translation
        };
    }

    createChallengeUI(scene) {
        const width = scene.cameras.main.width;
        const height = scene.cameras.main.height;

        // Display the word to read (LARGE and clear)
        const wordText = scene.add.text(width / 2, 250, this.challengeData.word.toUpperCase(), {
            fontSize: '120px',
            fontFamily: 'Arial',
            color: '#2C3E50',
            fontStyle: 'bold',
            stroke: '#FFFFFF',
            strokeThickness: 8
        });
        wordText.setOrigin(0.5);
        this.uiElements.push(wordText);

        // Microphone button (large, centered)
        const micBtnSize = 150;
        this.micButton = scene.add.circle(width / 2, 450, micBtnSize / 2, 0xFF6B6B, 1);
        this.micButton.setInteractive({ useHandCursor: true });
        this.micButton.setStrokeStyle(6, 0xFFFFFF);
        this.uiElements.push(this.micButton);

        // Microphone emoji
        const micEmoji = scene.add.text(width / 2, 450, '🎤', {
            fontSize: '80px'
        });
        micEmoji.setOrigin(0.5);
        this.uiElements.push(micEmoji);

        // Progress indicators (balls)
        this.createBallIndicators(scene);

        // Set up microphone button events
        this.micButton.on('pointerdown', () => {
            if (!this.isListening) {
                this.startListening(scene);
            }
        });

        // Initialize Web Speech API
        this.initializeSpeechRecognition(scene);
    }

    createBallIndicators(scene) {
        const width = scene.cameras.main.width;
        const y = 650;
        const spacing = 60;

        // Calculate total width to center properly
        // Total width = circle radius + (circles * spacing) + gift half-width
        const totalWidth = this.requiredCorrect * spacing + 44;
        const startX = width / 2 - totalWidth / 2 + 20;

        this.ballIndicators = [];

        for (let i = 0; i < this.requiredCorrect; i++) {
            const x = startX + i * spacing;

            const circle = scene.add.circle(x, y, 20,
                i < this.correctCount ? 0x27AE60 : 0xffffff, 1);
            circle.setStrokeStyle(3, 0x000000);

            this.ballIndicators.push(circle);
            this.uiElements.push(circle);
        }

        // Add gift emoji at the end
        const giftX = startX + this.requiredCorrect * spacing;
        const giftEmoji = scene.add.text(giftX, y, '🎁', {
            fontSize: '48px'
        }).setOrigin(0.5);
        this.uiElements.push(giftEmoji);
    }

    updateBallIndicators() {
        for (let i = 0; i < this.ballIndicators.length; i++) {
            if (i < this.correctCount) {
                this.ballIndicators[i].setFillStyle(0x27AE60); // Green
            } else {
                this.ballIndicators[i].setFillStyle(0xffffff); // White
            }
        }
    }

    initializeSpeechRecognition(scene) {
        // Check if Web Speech API is supported
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            console.error('Web Speech API not supported in this browser');
            this.statusText.setText('Mikrofon stöds ej i denna webbläsare');
            this.micButton.disableInteractive();
            return;
        }

        // Create recognition instance
        this.recognition = new SpeechRecognition();
        this.recognition.lang = 'sv-SE'; // Swedish
        this.recognition.continuous = false; // Stop after one result
        this.recognition.interimResults = false;
        this.recognition.maxAlternatives = 5; // Get multiple alternatives

        // Handle results
        this.recognition.onresult = (event) => {
            const results = event.results[0];
            const transcript = results[0].transcript.toLowerCase().trim();

            console.log('Heard:', transcript, 'Expected:', this.challengeData.word);
            console.log('All alternatives:', Array.from(results).map(r => r.transcript));

            this.handleSpeechResult(scene, transcript, results);
        };

        // Handle errors
        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            this.isListening = false;
            this.micButton.setFillStyle(0xFF6B6B);

            if (event.error === 'no-speech') {
                this.statusText.setText('Ingen röst hördes. Försök igen!');
            } else if (event.error === 'not-allowed') {
                this.statusText.setText('Mikrofon ej tillåten');
            } else {
                this.statusText.setText('Fel uppstod. Försök igen!');
            }
        };

        // Handle end of recognition
        this.recognition.onend = () => {
            this.isListening = false;
            if (this.micButton) {
                this.micButton.setFillStyle(0xFF6B6B);
            }
        };
    }

    startListening(scene) {
        if (!this.recognition || this.isListening) return;

        this.isListening = true;
        this.micButton.setFillStyle(0x27AE60); // Green = listening
        this.statusText.setText('Lyssnar...');

        try {
            this.recognition.start();
        } catch (e) {
            console.error('Failed to start recognition:', e);
            this.isListening = false;
            this.micButton.setFillStyle(0xFF6B6B);
            this.statusText.setText('Fel! Försök igen');
        }
    }

    handleSpeechResult(scene, transcript, results) {
        const expectedWord = this.challengeData.word.toLowerCase();

        // Check if any of the alternatives match
        let isCorrect = false;
        for (let i = 0; i < results.length; i++) {
            const alternative = results[i].transcript.toLowerCase().trim();
            if (this.wordsMatch(alternative, expectedWord)) {
                isCorrect = true;
                break;
            }
        }

        if (isCorrect) {
            this.handleCorrectAnswer(scene);
        } else {
            this.handleWrongAnswer(scene, transcript);
        }
    }

    wordsMatch(spoken, expected) {
        // Exact match
        if (spoken === expected) return true;

        // Remove punctuation and extra spaces
        const cleanSpoken = spoken.replace(/[.,!?]/g, '').trim();
        const cleanExpected = expected.replace(/[.,!?]/g, '').trim();

        if (cleanSpoken === cleanExpected) return true;

        // Check if spoken contains the expected word
        if (cleanSpoken.includes(cleanExpected)) return true;

        return false;
    }

    handleCorrectAnswer(scene) {
        this.statusText.setText('✅ Rätt!');
        this.statusText.setColor('#27AE60');

        this.correctCount++;
        this.updateBallIndicators();

        // Success particles
        this.showSuccessParticles(scene, scene.cameras.main.width / 2, 450);

        // Check if won
        if (this.correctCount >= this.requiredCorrect) {
            scene.time.delayedCall(1000, () => {
                const x = scene.cameras.main.width / 2;
                const y = scene.cameras.main.height / 2;
                this.answerCallback(true, this.challengeData.word, x, y);
            });
        } else {
            // Load next word
            scene.time.delayedCall(1500, () => {
                this.loadNextWord(scene);
            });
        }
    }

    handleWrongAnswer(scene, transcript) {
        // Track wrong answer
        trackWrongAnswer(
            'SpeechRecognitionMode',
            this.challengeData.word,
            transcript
        );

        this.statusText.setText(`❌ Du sa: "${transcript}"`);
        this.statusText.setColor('#E74C3C');

        // Allow retry
        scene.time.delayedCall(2000, () => {
            this.statusText.setText('Tryck för att försöka igen');
            this.statusText.setColor('#95A5A6');
        });
    }

    loadNextWord(scene) {
        // Clean up current UI
        this.statusText.setText('');
        this.statusText.setColor('#95A5A6');

        // Generate new word
        this.generateChallenge();

        // Update word text (find it in uiElements)
        const wordText = this.uiElements.find(el => el.type === 'Text' && el.text.length < 15);
        if (wordText) {
            wordText.setText(this.challengeData.word.toUpperCase());
        }

        this.statusText.setText('Tryck för att prata');
    }

    showSuccessParticles(scene, x, y) {
        // Create star texture if needed
        if (!scene.textures.exists('star')) {
            const graphics = scene.add.graphics();
            graphics.fillStyle(0xFFFF00, 1);
            graphics.lineStyle(2, 0xFFD700);

            const outerRadius = 12;
            const innerRadius = 5;
            const points = 5;

            graphics.beginPath();
            for (let i = 0; i < points * 2; i++) {
                const radius = i % 2 === 0 ? outerRadius : innerRadius;
                const angle = (i * Math.PI) / points;
                const px = 12 + radius * Math.sin(angle);
                const py = 12 - radius * Math.cos(angle);
                if (i === 0) {
                    graphics.moveTo(px, py);
                } else {
                    graphics.lineTo(px, py);
                }
            }
            graphics.closePath();
            graphics.fillPath();
            graphics.strokePath();

            graphics.generateTexture('star', 24, 24);
            graphics.destroy();
        }

        const particles = scene.add.particles(x, y, 'star', {
            speed: { min: 100, max: 200 },
            angle: { min: 0, max: 360 },
            scale: { start: 2, end: 0 },
            lifespan: 600,
            gravityY: 150,
            tint: [0xFFFF00, 0xFFD700, 0xFFA500],
            quantity: 20
        });
        particles.setDepth(100);
        particles.explode();

        scene.time.delayedCall(700, () => particles.destroy());
    }

    cleanup(scene) {
        // Stop recognition if active
        if (this.recognition && this.isListening) {
            this.recognition.stop();
        }

        this.isListening = false;
        this.ballIndicators = [];

        // Destroy all UI elements
        this.uiElements.forEach(element => {
            if (element && element.destroy) {
                element.destroy();
            }
        });
        this.uiElements = [];
    }
}
