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
        this.permissionGranted = false;
        this.networkTested = false;
        this.hasNetworkConnection = false;
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

        // Microphone button (large, centered) - start disabled
        const micBtnSize = 150;
        this.micButton = scene.add.circle(width / 2, 450, micBtnSize / 2, 0x95A5A6, 1); // Gray = disabled
        this.micButton.setStrokeStyle(6, 0xFFFFFF);
        this.uiElements.push(this.micButton);

        // Microphone emoji
        const micEmoji = scene.add.text(width / 2, 450, '🎤', {
            fontSize: '80px',
            padding: { y: 20 }
        });
        micEmoji.setOrigin(0.5);
        this.uiElements.push(micEmoji);

        // Status text (below button)
        this.statusText = scene.add.text(width / 2, 580, 'Väntar på mikrofon...', {
            fontSize: '24px',
            fontFamily: 'Arial',
            color: '#95A5A6'
        });
        this.statusText.setOrigin(0.5);
        this.uiElements.push(this.statusText);

        // Progress indicators (balls)
        this.createBallIndicators(scene);

        // Initialize Web Speech API and request permission
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
            fontSize: '48px',
            padding: { y: 10 }
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
            if (this.statusText) {
                this.statusText.setText('Mikrofon stöds ej i denna webbläsare');
            }
            return;
        }

        // Check for HTTPS (required for production)
        if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
            console.warn('⚠️ Speech recognition requires HTTPS or localhost');
        }

        console.log('🎤 Initializing Speech Recognition:', {
            protocol: location.protocol,
            hostname: location.hostname,
            browser: navigator.userAgent.split(' ').pop()
        });

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
            console.error('Speech recognition error:', event.error, {
                message: event.message,
                error: event.error,
                type: event.type,
                timestamp: new Date().toISOString()
            });
            this.isListening = false;

            if (this.micButton && this.permissionGranted) {
                this.micButton.setFillStyle(0xFF6B6B);
            }

            if (this.statusText) {
                if (event.error === 'no-speech') {
                    this.statusText.setText('Ingen röst hördes. Försök igen!');
                    this.statusText.setColor('#95A5A6');
                } else if (event.error === 'not-allowed') {
                    this.statusText.setText('Mikrofon ej tillåten - tryck på knappen igen');
                    this.statusText.setColor('#E74C3C');
                    this.permissionGranted = false;
                } else if (event.error === 'network') {
                    console.error('🔴 Network error details:', {
                        protocol: location.protocol,
                        isSecure: location.protocol === 'https:',
                        isLocalhost: location.hostname === 'localhost',
                        online: navigator.onLine,
                        hasConnection: this.hasNetworkConnection
                    });

                    this.statusText.setText('⚠️ Kan inte nå röstigenkänning');
                    this.statusText.setColor('#FFA500');
                    this.hasNetworkConnection = false;

                    // Wait longer before retrying (5 seconds)
                    scene.time.delayedCall(5000, () => {
                        if (this.statusText && this.permissionGranted) {
                            this.statusText.setText('Tryck för att försöka igen');
                            this.statusText.setColor('#95A5A6');
                        }
                    });
                } else if (event.error === 'aborted') {
                    this.statusText.setText('Avbruten. Tryck igen!');
                    this.statusText.setColor('#95A5A6');
                } else if (event.error === 'audio-capture') {
                    this.statusText.setText('Mikrofonfel. Kolla inställningar');
                    this.statusText.setColor('#E74C3C');
                } else if (event.error === 'service-not-allowed') {
                    this.statusText.setText('Röstigenkänning inte tillåten');
                    this.statusText.setColor('#E74C3C');
                } else {
                    this.statusText.setText(`Fel (${event.error}). Försök igen!`);
                    this.statusText.setColor('#E74C3C');
                }
            }
        };

        // Handle start
        this.recognition.onstart = () => {
            console.log('🎤 Recognition session started');
        };

        // Handle end of recognition
        this.recognition.onend = () => {
            console.log('🎤 Recognition session ended');
            this.isListening = false;
            if (this.micButton && this.permissionGranted) {
                this.micButton.setFillStyle(0xFF6B6B);
            }
        };

        // Request microphone permission early
        this.requestMicrophonePermission(scene);
    }

    async requestMicrophonePermission(scene) {
        // Use getUserMedia to request microphone permission (doesn't require internet)
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.error('getUserMedia not supported');
            if (this.statusText) {
                this.statusText.setText('Mikrofon stöds ej');
            }
            return;
        }

        if (this.statusText) {
            this.statusText.setText('Klicka "Tillåt" för mikrofonen');
        }

        try {
            // Request microphone access (this works offline)
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Permission granted! Stop the stream immediately
            stream.getTracks().forEach(track => track.stop());

            console.log('Microphone permission granted');
            this.permissionGranted = true;

            // Enable the microphone button
            if (this.micButton) {
                this.micButton.setFillStyle(0xFF6B6B); // Red = ready
                this.micButton.setInteractive({ useHandCursor: true });

                // Set up click handler
                this.micButton.on('pointerdown', () => {
                    if (!this.isListening && this.permissionGranted) {
                        this.startListening(scene);
                    }
                });
            }

            // Test network connection to speech API
            this.testNetworkConnection(scene);

        } catch (error) {
            console.error('Microphone permission denied:', error);
            if (this.statusText) {
                this.statusText.setText('Mikrofon ej tillåten');
            }
        }
    }

    async testNetworkConnection(scene) {
        // Test actual connectivity by making a simple request
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

            await fetch('https://www.google.com/favicon.ico', {
                mode: 'no-cors',
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            // Connection successful
            this.hasNetworkConnection = true;
            this.networkTested = true;

            if (this.statusText && this.permissionGranted) {
                this.statusText.setText('Tryck för att prata');
                this.statusText.setColor('#95A5A6');
            }

            console.log('Network connection test: SUCCESS');

        } catch (error) {
            // No connection
            this.hasNetworkConnection = false;
            this.networkTested = true;

            if (this.statusText) {
                this.statusText.setText('⚠️ Ingen internet - behövs för röstigenkänning');
                this.statusText.setColor('#FFA500');
            }

            console.log('Network connection test: FAILED', error.message);

            // Retry after 5 seconds
            scene.time.delayedCall(5000, () => {
                if (this.statusText && !this.hasNetworkConnection) {
                    this.testNetworkConnection(scene);
                }
            });
        }
    }

    startListening(scene) {
        if (!this.recognition || this.isListening || !this.permissionGranted) {
            console.log('Cannot start listening:', {
                hasRecognition: !!this.recognition,
                isListening: this.isListening,
                permissionGranted: this.permissionGranted
            });
            return;
        }

        // Allow retry even without network test passing
        // (network test might fail but speech API might still work)

        console.log('🎙️ Starting speech recognition...');
        this.isListening = true;
        this.micButton.setFillStyle(0x27AE60); // Green = listening
        if (this.statusText) {
            this.statusText.setText('Lyssnar...');
            this.statusText.setColor('#95A5A6');
        }

        try {
            this.recognition.start();
            console.log('✅ Recognition started successfully');
        } catch (e) {
            console.error('❌ Failed to start recognition:', e);
            this.isListening = false;
            this.micButton.setFillStyle(0xFF6B6B);
            if (this.statusText) {
                if (e.message.includes('already started')) {
                    this.statusText.setText('Redan igång - vänta lite');
                } else {
                    this.statusText.setText('Fel! Försök igen');
                }
            }
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
        if (this.statusText) {
            this.statusText.setText('✅ Rätt!');
            this.statusText.setColor('#27AE60');
        }

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

        if (this.statusText) {
            this.statusText.setText(`❌ Du sa: "${transcript}"`);
            this.statusText.setColor('#E74C3C');

            // Allow retry
            scene.time.delayedCall(2000, () => {
                if (this.statusText) {
                    this.statusText.setText('Tryck för att försöka igen');
                    this.statusText.setColor('#95A5A6');
                }
            });
        }
    }

    loadNextWord(scene) {
        // Clean up current UI
        if (this.statusText) {
            this.statusText.setText('');
            this.statusText.setColor('#95A5A6');
        }

        // Generate new word
        this.generateChallenge();

        // Update word text (find it in uiElements)
        const wordText = this.uiElements.find(el => el.type === 'Text' && el.text.length < 15);
        if (wordText) {
            wordText.setText(this.challengeData.word.toUpperCase());
        }

        if (this.statusText) {
            this.statusText.setText('Tryck för att prata');
        }
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
