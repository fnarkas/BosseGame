/**
 * Shared Speech Recognition Helper
 * Used by SpeechRecognitionMode and NumberReadingMode
 * Handles all the special cases for microphone permission, network testing, timeouts, etc.
 */

import { registerRecognition, releaseRecognition, restoreAudioAfterMic } from './micSession.js';

export class SpeechRecognitionHelper {
    constructor(lang = 'sv-SE') {
        this.lang = lang;
        this.recognition = null;
        this.scene = null;
        this.isListening = false;
        this.permissionGranted = false;
        this.networkTested = false;
        this.hasNetworkConnection = false;
        this.recognitionTimeout = null;

        // Callbacks
        this.onResult = null;
        this.onError = null;
        this.onStart = null;
        this.onEnd = null;
        this.onStatusChange = null;
    }

    /**
     * Initialize speech recognition and request permissions
     */
    async initialize(scene) {
        // Check if Web Speech API is supported
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            console.error('Web Speech API not supported in this browser');
            if (this.onStatusChange) {
                this.onStatusChange('Mikrofon stöds ej i denna webbläsare', '#E74C3C');
            }
            return false;
        }

        // Check for HTTPS (required for production)
        if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
            console.warn('⚠️ Speech recognition requires HTTPS or localhost');
        }

        console.log('🎤 Initializing Speech Recognition:', {
            protocol: location.protocol,
            hostname: location.hostname,
            browser: navigator.userAgent.split(' ').pop(),
            lang: this.lang
        });

        // Create recognition instance
        this.recognition = new SpeechRecognition();
        this.recognition.lang = this.lang;
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.maxAlternatives = 5;

        // Set up event handlers
        this.recognition.onresult = (event) => {
            // Clear timeout since we got a result
            if (this.recognitionTimeout) {
                this.recognitionTimeout.remove();
                this.recognitionTimeout = null;
            }

            const results = event.results[0];
            const transcript = results[0].transcript.toLowerCase().trim();

            console.log('Speech heard:', transcript);
            console.log('All alternatives:', Array.from(results).map(r => r.transcript));

            if (this.onResult) {
                this.onResult(transcript, results);
            }
        };

        this.recognition.onerror = (event) => {
            // Clear timeout since we got an error
            if (this.recognitionTimeout) {
                this.recognitionTimeout.remove();
                this.recognitionTimeout = null;
            }

            console.error('Speech recognition error:', event.error, {
                message: event.message,
                error: event.error,
                type: event.type,
                timestamp: new Date().toISOString()
            });

            this.isListening = false;

            // Call custom error handler
            if (this.onError) {
                this.onError(event.error);
            }

            // Update status based on error type
            if (this.onStatusChange) {
                if (event.error === 'no-speech') {
                    this.onStatusChange('Ingen röst hördes. Försök igen!', '#95A5A6');
                } else if (event.error === 'not-allowed') {
                    this.onStatusChange('Mikrofon ej tillåten - tryck på knappen igen', '#E74C3C');
                    this.permissionGranted = false;
                } else if (event.error === 'network') {
                    console.error('🔴 Network error details:', {
                        protocol: location.protocol,
                        isSecure: location.protocol === 'https:',
                        isLocalhost: location.hostname === 'localhost',
                        online: navigator.onLine,
                        hasConnection: this.hasNetworkConnection
                    });

                    // Network errors are common with speech recognition
                    // Show helpful message and allow immediate retry
                    this.onStatusChange('Nätverksfel - Tryck för att försöka igen', '#FFA500');

                    // Don't mark network as down - this is likely a temporary API issue
                    // Allow immediate retry
                } else if (event.error === 'aborted') {
                    this.onStatusChange('Avbruten. Tryck igen!', '#95A5A6');
                } else if (event.error === 'audio-capture') {
                    this.onStatusChange('Mikrofonfel. Kolla inställningar', '#E74C3C');
                } else if (event.error === 'service-not-allowed') {
                    this.onStatusChange('Röstigenkänning inte tillåten', '#E74C3C');
                } else {
                    this.onStatusChange(`Fel (${event.error}). Försök igen!`, '#E74C3C');
                }
            }
        };

        this.recognition.onstart = () => {
            console.log('🎤 Recognition session started');
            if (this.onStart) {
                this.onStart();
            }
        };

        this.recognition.onend = () => {
            console.log('🎤 Recognition session ended');
            this.isListening = false;
            // The microphone is released now - cycle the audio context so iOS
            // drops out of play-and-record mode (see micSession.js).
            restoreAudioAfterMic(this.scene);
            if (this.onEnd) {
                this.onEnd();
            }
        };

        this.scene = scene;
        registerRecognition(this.recognition);

        // Do NOT open the microphone here. On iOS, any capture (getUserMedia
        // included) flips the audio session into a heavily attenuated
        // play-and-record mode that can stick for the life of the tab.
        // SpeechRecognition asks for permission itself on the first start(),
        // so we treat permission as granted until the browser says otherwise
        // via a 'not-allowed' error.
        this.permissionGranted = true;

        // Test network connection to speech API
        await this.testNetworkConnection(scene);

        return true;
    }

    /**
     * Test network connection to ensure speech API is reachable
     */
    async testNetworkConnection(scene) {
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

            if (this.onStatusChange && this.permissionGranted) {
                this.onStatusChange('Tryck för att prata', '#95A5A6');
            }

            console.log('✅ Network connection test: SUCCESS');

        } catch (error) {
            // No connection
            this.hasNetworkConnection = false;
            this.networkTested = true;

            if (this.onStatusChange) {
                this.onStatusChange('⚠️ Ingen internet - behövs för röstigenkänning', '#FFA500');
            }

            console.log('❌ Network connection test: FAILED', error.message);

            // Retry after 5 seconds (unless the helper was cleaned up meanwhile)
            scene.time.delayedCall(5000, () => {
                if (!this.recognition) return;
                if (!this.hasNetworkConnection) {
                    this.testNetworkConnection(scene);
                }
            });
        }
    }

    /**
     * Start listening for speech
     */
    startListening(scene) {
        if (!this.recognition || this.isListening) {
            console.log('Cannot start listening:', {
                hasRecognition: !!this.recognition,
                isListening: this.isListening
            });
            return false;
        }

        // A tap is always allowed to retry after a 'not-allowed' error; the
        // browser will prompt again if it needs to.
        this.permissionGranted = true;

        console.log('🎙️ Starting speech recognition...');
        this.isListening = true;

        if (this.onStatusChange) {
            this.onStatusChange('Lyssnar...', '#95A5A6');
        }

        try {
            this.recognition.start();
            console.log('✅ Recognition started successfully');

            // Safari/iOS workaround: Set timeout to stop recognition after 5 seconds
            // This prevents infinite listening state
            this.recognitionTimeout = scene.time.delayedCall(5000, () => {
                console.log('⏱️ Recognition timeout - stopping');
                if (this.recognition && this.isListening) {
                    try {
                        this.recognition.stop();
                    } catch (e) {
                        console.error('Error stopping recognition:', e);
                    }
                    this.isListening = false;
                    if (this.onStatusChange) {
                        this.onStatusChange('Ingen röst hördes. Försök igen!', '#FFA500');
                    }
                }
            });

            return true;

        } catch (e) {
            console.error('❌ Failed to start recognition:', e);
            this.isListening = false;

            if (this.onStatusChange) {
                if (e.message.includes('already started')) {
                    this.onStatusChange('Redan igång - vänta lite', '#FFA500');
                } else {
                    this.onStatusChange('Fel! Försök igen', '#E74C3C');
                }
            }

            return false;
        }
    }

    /**
     * Stop listening
     */
    stopListening() {
        if (this.recognitionTimeout) {
            this.recognitionTimeout.remove();
            this.recognitionTimeout = null;
        }

        if (this.recognition && this.isListening) {
            try {
                this.recognition.stop();
            } catch (e) {
                console.error('Error stopping recognition:', e);
            }
        }

        this.isListening = false;
    }

    /**
     * Clean up resources
     */
    cleanup() {
        if (this.recognitionTimeout) {
            this.recognitionTimeout.remove();
            this.recognitionTimeout = null;
        }
        // abort() tears the capture session down immediately; stop() would
        // wait for final results and can leave the mic open on iOS.
        releaseRecognition(this.recognition);
        this.isListening = false;
        this.recognition = null;
        this.scene = null;
        this.onResult = null;
        this.onError = null;
        this.onStart = null;
        this.onEnd = null;
        this.onStatusChange = null;
    }
}
