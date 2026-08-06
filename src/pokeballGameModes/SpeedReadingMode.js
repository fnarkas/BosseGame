import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { getTopCommonWords } from '../commonSwedishWords.js';
import { trackWrongAnswer } from '../wrongAnswers.js';

// ⚙️ DEFAULTS (overridable from public/config/minigames.json → speedReading)
const DEFAULT_WORD_COUNT = 100;   // How many of the most common words are in play
const DEFAULT_DURATION = 60;      // Seconds on the clock
const DEFAULT_MAX_COINS = 50;     // 1 word = 1 coin, capped here

// Swedish homophones: words that sound the same but are spelled differently, so
// the speech recognizer may return a different spelling than the shown word.
// Because they are acoustically identical, any spelling in a group is accepted.
// Each group also includes the colloquial/spoken forms the recognizer often
// emits (e.g. "och" → "å", "något" → "nåt").
const HOMOPHONE_GROUPS = [
    ['sig', 'säg', 'sej', 'säj'],   // all pronounced /sɛj/
    ['mig', 'mej'],
    ['dig', 'dej'],
    ['de', 'dem', 'dom'],           // all pronounced "dom"
    ['det', 'de', 'dé'],            // "det" spoken as "de"
    ['och', 'o', 'å', 'ock'],
    ['att', 'å'],
    ['jag', 'ja'],
    ['är', 'e', 'ä'],
    ['vad', 'va'],
    ['med', 'me'],
    ['han', 'hann'],
    ['någon', 'nån'],
    ['något', 'nåt'],
    ['några', 'nåra'],
    ['sådan', 'sån'],
    ['sådant', 'sånt'],
    ['sedan', 'sen'],
    ['mycket', 'mycke'],
    ['staden', 'stan'],
    ['dagen', 'dan'],
    ['morgon', 'morron'],
];

// True if `a` and `b` are the same word or share a homophone group.
function homophonesMatch(a, b) {
    if (a === b) return true;
    for (const group of HOMOPHONE_GROUPS) {
        if (group.includes(a) && group.includes(b)) return true;
    }
    return false;
}

/**
 * Speed Reading game mode
 * The player reads as many Swedish words as possible before the timer runs out.
 * One word is shown at a time; the microphone listens continuously. Each word
 * read correctly is worth one coin, up to a maximum. A progress bar shows how
 * many coins have been earned and a timer bar shows the time remaining.
 */
export class SpeedReadingMode extends BasePokeballGameMode {
    constructor() {
        super();

        // Config (loaded from server, falls back to defaults)
        this.wordCount = DEFAULT_WORD_COUNT;
        this.durationSeconds = DEFAULT_DURATION;
        this.maxCoins = DEFAULT_MAX_COINS;
        this.configLoaded = false;

        // Word pool + current word
        this.wordPool = [];
        this.currentWord = null;

        // Speech recognition state
        this.recognition = null;
        this.isListening = false;
        this.resultHandled = false;   // Guards against double-processing one utterance
        this.permissionGranted = false;
        this.gameActive = false;
        this.finished = false;

        // Scoring / timing
        this.earnedCoins = 0;       // Read by PokeballGameScene for the reward
        this.timeLeft = DEFAULT_DURATION;
        this.timerEvent = null;

        // UI references
        this.wordText = null;
        this.micButton = null;
        this.micEmoji = null;
        this.listenRing = null;   // Pulsing ring shown while actively listening
        this.ringTween = null;
        this.statusText = null;
        this.timerBarFill = null;
        this.timerBarWidth = 0;
        this.timerBarX = 0;
        this.progressBarFill = null;
        this.progressBarWidth = 0;
        this.progressBarX = 0;
        this.coinCountText = null;
    }

    async loadConfig() {
        try {
            const response = await fetch('/config/minigames.json');
            if (response.ok) {
                const serverConfig = await response.json();
                if (serverConfig.speedReading) {
                    this.wordCount = serverConfig.speedReading.wordCount || this.wordCount;
                    this.durationSeconds = serverConfig.speedReading.durationSeconds || this.durationSeconds;
                    this.maxCoins = serverConfig.speedReading.maxCoins || this.maxCoins;
                    console.log('SpeedReadingMode loaded config:', {
                        wordCount: this.wordCount,
                        durationSeconds: this.durationSeconds,
                        maxCoins: this.maxCoins
                    });
                }
            }
        } catch (error) {
            console.warn('Failed to load SpeedReading config, using defaults:', error);
        }
        this.timeLeft = this.durationSeconds;
        this.configLoaded = true;
    }

    generateChallenge() {
        // Build the pool of top-N common words once.
        if (this.wordPool.length === 0) {
            this.wordPool = getTopCommonWords(this.wordCount);
        }
        this.currentWord = this.pickWord();
        this.challengeData = { word: this.currentWord };
    }

    pickWord() {
        // Pick a random word, avoiding an immediate repeat of the current one.
        if (this.wordPool.length <= 1) return this.wordPool[0];
        let word;
        do {
            word = this.wordPool[Math.floor(Math.random() * this.wordPool.length)];
        } while (word === this.currentWord);
        return word;
    }

    createChallengeUI(scene) {
        const width = scene.cameras.main.width;
        this.scene = scene;

        // ---- Timer bar (top) ----
        const barMargin = 120;
        this.timerBarX = barMargin;
        this.timerBarWidth = width - barMargin * 2;
        const timerY = 150;

        const timerClock = scene.add.text(barMargin - 70, timerY, '⏱️', {
            fontSize: '48px'
        }).setOrigin(0.5);
        this.uiElements.push(timerClock);

        const timerBg = scene.add.rectangle(this.timerBarX, timerY, this.timerBarWidth, 34, 0xffffff)
            .setOrigin(0, 0.5);
        timerBg.setStrokeStyle(3, 0x2C3E50);
        this.uiElements.push(timerBg);

        this.timerBarFill = scene.add.rectangle(this.timerBarX, timerY, this.timerBarWidth, 34, 0x2ECC71)
            .setOrigin(0, 0.5);
        this.uiElements.push(this.timerBarFill);

        // ---- Coin progress bar ----
        const coinY = 240;
        const coinIcon = scene.add.text(barMargin - 70, coinY, '🪙', {
            fontSize: '48px'
        }).setOrigin(0.5);
        this.uiElements.push(coinIcon);

        this.progressBarX = barMargin;
        this.progressBarWidth = width - barMargin * 2;

        const progressBg = scene.add.rectangle(this.progressBarX, coinY, this.progressBarWidth, 40, 0xffffff)
            .setOrigin(0, 0.5);
        progressBg.setStrokeStyle(3, 0xB8860B);
        this.uiElements.push(progressBg);

        this.progressBarFill = scene.add.rectangle(this.progressBarX, coinY, 0, 40, 0xFFD700)
            .setOrigin(0, 0.5);
        this.uiElements.push(this.progressBarFill);

        // Tick marks every 10 coins as coin thresholds.
        const tickStep = 10;
        for (let c = tickStep; c < this.maxCoins; c += tickStep) {
            const tx = this.progressBarX + (c / this.maxCoins) * this.progressBarWidth;
            const tick = scene.add.rectangle(tx, coinY, 3, 40, 0xB8860B).setOrigin(0.5);
            this.uiElements.push(tick);
        }

        // Trophy at the far end (max reward).
        const trophy = scene.add.text(this.progressBarX + this.progressBarWidth + 40, coinY, '🏆', {
            fontSize: '44px'
        }).setOrigin(0.5);
        this.uiElements.push(trophy);

        // Running coin count.
        this.coinCountText = scene.add.text(width / 2, coinY, '0', {
            fontSize: '28px',
            fontFamily: 'Arial',
            color: '#7A5C00',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.uiElements.push(this.coinCountText);

        // ---- Word to read (large, centered) ----
        this.wordText = scene.add.text(width / 2, 470, this.challengeData.word.toUpperCase(), {
            fontSize: '150px',
            fontFamily: 'Arial',
            color: '#2C3E50',
            fontStyle: 'bold',
            stroke: '#FFFFFF',
            strokeThickness: 10,
            align: 'center'
        }).setOrigin(0.5);
        this.uiElements.push(this.wordText);

        // ---- Microphone button ----
        const micY = 680;
        const micBtnSize = 150;

        // Ring behind the button conveys the listening state:
        //   pulsing green = listening, solid amber = evaluating, hidden = idle.
        this.listenRing = scene.add.circle(width / 2, micY, micBtnSize / 2 + 14, 0x000000, 0);
        this.listenRing.setStrokeStyle(8, 0x2ECC71, 1);
        this.listenRing.setVisible(false);
        this.uiElements.push(this.listenRing);

        this.micButton = scene.add.circle(width / 2, micY, micBtnSize / 2, 0x95A5A6, 1);
        this.micButton.setStrokeStyle(6, 0xFFFFFF);
        this.uiElements.push(this.micButton);

        this.micEmoji = scene.add.text(width / 2, micY, '🎤', {
            fontSize: '80px',
            padding: { y: 20 }
        }).setOrigin(0.5);
        this.uiElements.push(this.micEmoji);

        // ---- Status text ----
        this.statusText = scene.add.text(width / 2, 800, 'Väntar på mikrofon...', {
            fontSize: '24px',
            fontFamily: 'Arial',
            color: '#95A5A6'
        }).setOrigin(0.5);
        this.uiElements.push(this.statusText);

        this.updateProgressBar();
        this.initializeSpeechRecognition(scene);
    }

    // ---------------- Speech recognition ----------------

    initializeSpeechRecognition(scene) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            console.error('Web Speech API not supported in this browser');
            if (this.statusText) this.statusText.setText('Mikrofon stöds ej i denna webbläsare');
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.lang = 'sv-SE';
        this.recognition.continuous = false;
        // Interim results are essential for short words like "ska" — the final
        // result often drops them, but an interim hypothesis catches them.
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 5;

        // Confirmed listening (mic is capturing).
        this.recognition.onstart = () => {
            this.resultHandled = false;
            if (this.gameActive) this.setMicState('listening');
        };

        // The child stopped talking — we're now evaluating what was heard.
        this.recognition.onspeechend = () => {
            if (this.gameActive && !this.resultHandled) this.setMicState('evaluating');
        };

        this.recognition.onresult = (event) => {
            if (!this.gameActive || this.resultHandled) return;

            const target = this.challengeData.word.toLowerCase();
            let matched = false;
            let finalTranscript = null;

            // Scan every result (interim + final) and every alternative so a
            // short word is accepted the moment any hypothesis matches it.
            for (let r = 0; r < event.results.length && !matched; r++) {
                const res = event.results[r];
                for (let a = 0; a < res.length; a++) {
                    const alt = res[a].transcript.toLowerCase().trim();
                    if (this.wordsMatch(alt, target)) { matched = true; break; }
                }
                if (res.isFinal) finalTranscript = res[0].transcript.toLowerCase().trim();
            }

            if (matched) {
                console.log('Matched:', target);
                this.resultHandled = true;
                this.handleCorrectWord(scene);
                // Reset the session so the next word gets a clean listen.
                try { this.recognition.stop(); } catch (e) { /* ignore */ }
            } else if (finalTranscript !== null) {
                // Only flag a miss once the recognizer is sure (final result).
                console.log('Heard:', finalTranscript, 'Expected:', target);
                this.resultHandled = true;
                this.setMicState('evaluating');
                this.handleWrongWord(scene, finalTranscript);
            }
        };

        this.recognition.onerror = (event) => {
            console.warn('Speech recognition error:', event.error);
            this.isListening = false;
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                this.permissionGranted = false;
                this.setMicState('idle');
                if (this.statusText) {
                    this.statusText.setText('Mikrofon ej tillåten - tryck på knappen');
                    this.statusText.setColor('#E74C3C');
                }
            }
        };

        this.recognition.onend = () => {
            this.isListening = false;
            // Auto-restart the listening loop while the game is running so the
            // child can just keep reading without pressing the button again.
            if (this.gameActive && this.permissionGranted) {
                // Stay in the "evaluating" look during the brief gap before the
                // next listen session starts.
                scene.time.delayedCall(150, () => {
                    if (this.gameActive && !this.isListening) {
                        this.startListening(scene);
                    }
                });
            } else if (this.permissionGranted && !this.gameActive && !this.finished) {
                this.setMicState('idle');
            }
        };

        this.requestMicrophonePermission(scene);
    }

    async requestMicrophonePermission(scene) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            if (this.statusText) this.statusText.setText('Mikrofon stöds ej');
            return;
        }

        if (this.statusText) this.statusText.setText('Klicka "Tillåt" för mikrofonen');

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            this.permissionGranted = true;

            if (this.micButton) {
                this.setMicState('idle');
                this.micButton.setInteractive({ useHandCursor: true });
                this.micButton.on('pointerdown', () => {
                    if (!this.isListening && this.permissionGranted) {
                        this.startListening(scene);
                    }
                });
            }

            if (this.statusText) {
                this.statusText.setText('Läs ordet!');
                this.statusText.setColor('#27AE60');
            }

            // Kick off the game automatically once the mic is ready.
            this.startListening(scene);
        } catch (error) {
            console.error('Microphone permission denied:', error);
            if (this.statusText) this.statusText.setText('Mikrofon ej tillåten');
        }
    }

    startListening(scene) {
        if (!this.recognition || this.isListening || !this.permissionGranted) return;

        // First listen starts the clock.
        if (!this.gameActive) {
            this.startTimer(scene);
        }

        this.isListening = true;
        this.resultHandled = false;
        // Optimistically show "listening" so there's no dead moment before the
        // recognition service fires onstart to confirm it.
        this.setMicState('listening');

        try {
            this.recognition.start();
        } catch (e) {
            console.warn('Failed to start recognition:', e.message);
            this.isListening = false;
        }
    }

    // ---------------- Mic state / listening indicator ----------------

    // Drives the visible listening indicator. Three meaningful states:
    //   listening  → green button + pulsing green ring ("read the word now")
    //   evaluating → amber button + solid amber ring ("heard you, checking")
    //   idle       → red button, no ring ("tap to talk")
    //   disabled   → gray button, no ring (waiting for mic permission)
    setMicState(state) {
        if (!this.micButton) return;
        this.micState = state;
        switch (state) {
            case 'disabled':
                this.micButton.setFillStyle(0x95A5A6);
                this.stopListenRing();
                break;
            case 'idle':
                this.micButton.setFillStyle(0xFF6B6B);
                this.stopListenRing();
                break;
            case 'listening':
                this.micButton.setFillStyle(0x27AE60);
                this.startListenRing();
                break;
            case 'evaluating':
                this.micButton.setFillStyle(0xF39C12);
                this.showEvalRing();
                if (this.statusText) {
                    this.statusText.setText('⏳ …');
                    this.statusText.setColor('#F39C12');
                }
                break;
        }
    }

    startListenRing() {
        if (!this.listenRing || !this.scene) return;
        this.listenRing.setStrokeStyle(8, 0x2ECC71, 1);
        this.listenRing.setVisible(true);
        // Don't stack tweens — the listen loop restarts every word.
        if (this.ringTween) return;
        this.listenRing.setScale(1);
        this.listenRing.setAlpha(1);
        this.ringTween = this.scene.tweens.add({
            targets: this.listenRing,
            scale: 1.35,
            alpha: 0.15,
            duration: 650,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    showEvalRing() {
        // Solid (non-pulsing) amber ring signals "evaluating".
        if (this.ringTween) { this.ringTween.stop(); this.ringTween = null; }
        if (!this.listenRing) return;
        this.listenRing.setScale(1);
        this.listenRing.setAlpha(1);
        this.listenRing.setStrokeStyle(8, 0xF39C12, 1);
        this.listenRing.setVisible(true);
    }

    stopListenRing() {
        if (this.ringTween) { this.ringTween.stop(); this.ringTween = null; }
        if (this.listenRing) {
            this.listenRing.setVisible(false);
            this.listenRing.setScale(1);
            this.listenRing.setAlpha(1);
        }
    }

    wordsMatch(spoken, expected) {
        if (!spoken) return false;
        if (spoken === expected) return true;
        const cleanSpoken = spoken.replace(/[.,!?]/g, '').trim();
        const cleanExpected = expected.replace(/[.,!?]/g, '').trim();
        if (cleanSpoken === cleanExpected) return true;

        const tokens = cleanSpoken.split(/\s+/);
        // Accept if the expected word appears among the spoken words.
        if (tokens.includes(cleanExpected)) return true;

        // Accept homophones (e.g. target "sig" heard as "säg"). We can't tell
        // these apart by voice, so any spoken token that sounds like the
        // expected word counts.
        for (const token of tokens) {
            if (homophonesMatch(token, cleanExpected)) return true;
        }

        // Mild tolerance for how the recognizer pads/clips short words, e.g.
        // "ska" heard as "skall", or "här" heard as "hä". Only for words of 3+
        // letters, and only a 1–2 character difference, to avoid false matches.
        if (cleanExpected.length >= 3) {
            for (const t of tokens) {
                if (t.length < 3) continue;
                if (t.startsWith(cleanExpected) && t.length - cleanExpected.length <= 2) return true;
                if (cleanExpected.startsWith(t) && cleanExpected.length - t.length <= 1) return true;
            }
        }
        return false;
    }

    handleCorrectWord(scene) {
        this.earnedCoins = Math.min(this.earnedCoins + 1, this.maxCoins);
        this.updateProgressBar();

        if (this.statusText) {
            this.statusText.setText('✅ Rätt!');
            this.statusText.setColor('#27AE60');
        }
        this.showSuccessParticles(scene, scene.cameras.main.width / 2, 470);

        // Reached the maximum reward — end early on a high note.
        if (this.earnedCoins >= this.maxCoins) {
            this.finishGame(scene);
            return;
        }

        // Next word immediately.
        this.currentWord = this.pickWord();
        this.challengeData = { word: this.currentWord };
        if (this.wordText) this.wordText.setText(this.challengeData.word.toUpperCase());
    }

    handleWrongWord(scene, transcript) {
        trackWrongAnswer('SpeedReadingMode', this.challengeData.word, transcript);
        if (this.statusText) {
            this.statusText.setText(`❌ "${transcript}"`);
            this.statusText.setColor('#E74C3C');
        }
        // Keep the same word — the listening loop restarts automatically so the
        // child can simply try reading it again.
    }

    // ---------------- Timer ----------------

    startTimer(scene) {
        this.gameActive = true;
        this.timeLeft = this.durationSeconds;

        this.timerEvent = scene.time.addEvent({
            delay: 100,
            loop: true,
            callback: () => {
                this.timeLeft -= 0.1;
                if (this.timeLeft <= 0) {
                    this.timeLeft = 0;
                    this.updateTimerBar();
                    this.finishGame(scene);
                } else {
                    this.updateTimerBar();
                }
            }
        });
    }

    updateTimerBar() {
        if (!this.timerBarFill) return;
        const fraction = Math.max(0, this.timeLeft / this.durationSeconds);
        this.timerBarFill.width = this.timerBarWidth * fraction;
        // Green → orange → red as time runs out.
        let color = 0x2ECC71;
        if (fraction < 0.25) color = 0xE74C3C;
        else if (fraction < 0.5) color = 0xF39C12;
        this.timerBarFill.setFillStyle(color);
    }

    updateProgressBar() {
        if (!this.progressBarFill) return;
        const fraction = Math.min(1, this.earnedCoins / this.maxCoins);
        this.progressBarFill.width = this.progressBarWidth * fraction;
        if (this.coinCountText) this.coinCountText.setText(`${this.earnedCoins}`);
    }

    finishGame(scene) {
        if (!this.gameActive) return;
        this.gameActive = false;
        this.finished = true;

        // Stop the timer.
        if (this.timerEvent) {
            this.timerEvent.remove();
            this.timerEvent = null;
        }

        // Stop listening.
        if (this.recognition && this.isListening) {
            try { this.recognition.stop(); } catch (e) { /* ignore */ }
        }
        this.isListening = false;

        // Clear the listening indicator — we're done.
        this.stopListenRing();
        if (this.micButton) this.micButton.setFillStyle(0x95A5A6);

        if (this.statusText) {
            this.statusText.setText(`🎉 ${this.earnedCoins} 🪙`);
            this.statusText.setColor('#27AE60');
        }

        // Hand the earned coins to the scene for the reward animation.
        scene.time.delayedCall(900, () => {
            const x = scene.cameras.main.width / 2;
            const y = scene.cameras.main.height / 2;
            this.answerCallback(true, this.challengeData.word, x, y);
        });
    }

    showSuccessParticles(scene, x, y) {
        if (!scene.textures.exists('speedStar')) {
            const graphics = scene.add.graphics();
            graphics.fillStyle(0xFFD700, 1);
            const outerRadius = 12;
            const innerRadius = 5;
            const points = 5;
            graphics.beginPath();
            for (let i = 0; i < points * 2; i++) {
                const radius = i % 2 === 0 ? outerRadius : innerRadius;
                const angle = (i * Math.PI) / points;
                const px = 12 + radius * Math.sin(angle);
                const py = 12 - radius * Math.cos(angle);
                if (i === 0) graphics.moveTo(px, py);
                else graphics.lineTo(px, py);
            }
            graphics.closePath();
            graphics.fillPath();
            graphics.generateTexture('speedStar', 24, 24);
            graphics.destroy();
        }

        const particles = scene.add.particles(x, y, 'speedStar', {
            speed: { min: 100, max: 200 },
            angle: { min: 0, max: 360 },
            scale: { start: 1.5, end: 0 },
            lifespan: 500,
            gravityY: 150,
            tint: [0xFFFF00, 0xFFD700, 0xFFA500],
            quantity: 15
        });
        particles.setDepth(100);
        particles.explode();
        scene.time.delayedCall(600, () => particles.destroy());
    }

    cleanup(scene) {
        this.gameActive = false;

        if (this.timerEvent) {
            this.timerEvent.remove();
            this.timerEvent = null;
        }

        if (this.recognition && this.isListening) {
            try { this.recognition.stop(); } catch (e) { /* ignore */ }
        }
        this.isListening = false;
        this.recognition = null;

        this.stopListenRing();

        this.uiElements.forEach(element => {
            if (element && element.destroy) element.destroy();
        });
        this.uiElements = [];

        this.wordText = null;
        this.micButton = null;
        this.micEmoji = null;
        this.listenRing = null;
        this.ringTween = null;
        this.statusText = null;
        this.timerBarFill = null;
        this.progressBarFill = null;
        this.coinCountText = null;
    }
}
