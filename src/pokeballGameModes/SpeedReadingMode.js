import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { LAYOUT } from './uiKit.js';
import { getTopCommonWords } from '../commonSwedishWords.js';
import { trackWrongAnswer } from '../wrongAnswers.js';
import { loadModeConfig } from '../minigameConfig.js';
import { SpeechRecognitionHelper } from '../utils/speechRecognitionHelper.js';
import { createMicButton } from '../components/MicButton.js';

// ⚙️ DEFAULTS (overridable from public/config/minigames.json → speedReading)
const DEFAULTS = {
    wordCount: 100,       // How many of the most common words are in play
    durationSeconds: 60,  // Seconds on the clock
    targetWords: 20,      // Words needed for the full reward
    maxCoins: 100         // Reward at (and capped to) the target
};

const WORD_Y = 470;
const MIC_Y = 680;

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
 *
 * The microphone is opened by SpeechRecognition itself on start(); nothing
 * here touches getUserMedia (see micSession.js for why that matters on iOS).
 * The listening state lives on the mic button (MicButton.js): there is no
 * status text, because the child cannot read.
 */
export class SpeedReadingMode extends BasePokeballGameMode {
    constructor() {
        super();

        // Config (loaded from server, falls back to defaults)
        this.wordCount = DEFAULTS.wordCount;
        this.durationSeconds = DEFAULTS.durationSeconds;
        this.targetWords = DEFAULTS.targetWords;
        this.maxCoins = DEFAULTS.maxCoins;
        this.configLoaded = false;

        // Word pool + current word
        this.wordPool = [];
        this.currentWord = null;

        // Speech recognition state
        this.speechHelper = new SpeechRecognitionHelper('sv-SE');
        this.resultHandled = false;   // Guards against double-processing one utterance
        this.gameActive = false;
        this.finished = false;

        // Scoring / timing
        this.correctWords = 0;      // Drives both the ramp and the progress bar
        this.earnedCoins = 0;       // Read by PokeballGameScene for the reward
        this.paysOwnCoins = true;   // ... instead of the streak/multiplier payout
        this.timeLeft = DEFAULTS.durationSeconds;
        this.timerEvent = null;

        // UI references
        this.wordText = null;
        this.mic = null;
        this.micButton = null;
        this.timerBarFill = null;
        this.timerBarWidth = 0;
        this.timerBarX = 0;
        this.progressBarFill = null;
        this.progressBarWidth = 0;
        this.progressBarX = 0;
        this.coinCountText = null;
    }

    get micState() {
        return this.mic ? this.mic.state : 'idle';
    }

    async loadConfig() {
        const config = await loadModeConfig('speedReading', DEFAULTS);
        this.wordCount = config.wordCount || DEFAULTS.wordCount;
        this.durationSeconds = config.durationSeconds || DEFAULTS.durationSeconds;
        this.targetWords = config.targetWords || DEFAULTS.targetWords;
        this.maxCoins = config.maxCoins || DEFAULTS.maxCoins;
        console.log('SpeedReadingMode loaded config:', {
            wordCount: this.wordCount,
            durationSeconds: this.durationSeconds,
            targetWords: this.targetWords,
            maxCoins: this.maxCoins
        });
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
        this.inputLocked = false;

        // ---- Timer bar (top) ----
        const barMargin = LAYOUT.BAR_MARGIN;
        this.timerBarX = barMargin;
        this.timerBarWidth = width - barMargin * 2;
        const timerY = LAYOUT.TIMER_Y;

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
        const coinY = LAYOUT.COIN_Y;
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

        // Tick marks every 5 words on the way to the target.
        const tickStep = 5;
        for (let w = tickStep; w < this.targetWords; w += tickStep) {
            const tx = this.progressBarX + (w / this.targetWords) * this.progressBarWidth;
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
        this.wordText = scene.add.text(width / 2, WORD_Y, this.challengeData.word.toUpperCase(), {
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
        this.mic = createMicButton(scene, this, {
            x: width / 2,
            y: MIC_Y,
            onTap: () => {
                // Once the round is over a tap must not restart the clock.
                if (this.finished || this.speechHelper.isListening) return;
                this.startListening(scene);
            }
        });
        this.micButton = this.mic.button;

        this.updateProgressBar();
        this.initializeSpeechRecognition(scene);
    }

    // ---------------- Speech recognition ----------------

    initializeSpeechRecognition(scene) {
        const helper = this.speechHelper;

        // Confirmed listening (mic is capturing).
        helper.onStart = () => {
            this.resultHandled = false;
            if (this.gameActive && this.mic) this.mic.setState('listening');
        };

        helper.onResult = (transcript, results) => this.handleResult(scene, results);

        helper.onError = (error) => {
            if (this.mic && (error === 'not-allowed' || error === 'service-not-allowed' || error === 'audio-capture')) {
                this.mic.setState('blocked');
            }
        };

        helper.onEnd = () => {
            // Auto-restart the listening loop while the game is running so the
            // child can just keep reading without pressing the button again.
            if (this.gameActive && helper.permissionGranted) {
                // Stay in the current look during the brief gap before the
                // next listen session starts.
                this.delayedCall(scene, 150, () => {
                    if (this.gameActive && !helper.isListening) {
                        this.startListening(scene);
                    }
                });
            } else if (this.mic && !this.finished && this.micState !== 'blocked') {
                this.mic.setState('idle');
            }
        };

        // The helper narrates its state as text; the child can't read it.
        helper.onStatusChange = () => {};

        // Creates the recognizer synchronously and probes the network in the
        // background. No microphone is opened until start().
        helper.initialize(scene);
        const recognition = helper.recognition;
        if (!recognition) {
            this.mic.setState('blocked');
            return;
        }

        // Interim results are essential for short words like "ska" — the final
        // result often drops them, but an interim hypothesis catches them.
        recognition.interimResults = true;

        // The child stopped talking — we're now evaluating what was heard.
        recognition.onspeechend = () => {
            if (this.gameActive && !this.resultHandled && this.mic) this.mic.setState('evaluating');
        };

        this.mic.enable();
        this.mic.setState('idle');

        // Kick off the game automatically.
        this.startListening(scene);
    }

    startListening(scene) {
        const helper = this.speechHelper;
        if (!helper.recognition || helper.isListening || this.finished) return;

        // First listen starts the clock.
        if (!this.gameActive) {
            this.startTimer(scene);
        }

        this.resultHandled = false;
        // Optimistically show "listening" so there's no dead moment before the
        // recognition service fires onstart to confirm it.
        if (helper.startListening(scene)) {
            this.mic.setState('listening');
        } else {
            this.mic.setState('idle');
        }
    }

    // `results` is one SpeechRecognitionResult: its alternatives, best first,
    // plus `isFinal`. Interim hypotheses arrive with isFinal = false.
    handleResult(scene, results) {
        if (!this.gameActive || this.resultHandled) return;

        const target = this.challengeData.word.toLowerCase();
        let matched = false;
        for (let a = 0; a < results.length; a++) {
            const alt = results[a].transcript.toLowerCase().trim();
            if (this.wordsMatch(alt, target)) { matched = true; break; }
        }

        if (matched) {
            console.log('Matched:', target);
            this.resultHandled = true;
            this.handleCorrectWord(scene);
            // Reset the session so the next word gets a clean listen.
            this.speechHelper.stopListening();
        } else if (results.isFinal) {
            // Only flag a miss once the recognizer is sure (final result).
            const finalTranscript = results[0].transcript.toLowerCase().trim();
            console.log('Heard:', finalTranscript, 'Expected:', target);
            this.resultHandled = true;
            this.handleWrongWord(scene, finalTranscript);
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
                // A clipped 3-letter word is 2 letters ("här" → "hä"), so only
                // single letters are too short to judge.
                if (t.length < 2) continue;
                if (t.startsWith(cleanExpected) && t.length - cleanExpected.length <= 2) return true;
                if (cleanExpected.startsWith(t) && cleanExpected.length - t.length <= 1) return true;
            }
        }
        return false;
    }

    // Reward accelerates with the number of words: quadratic up to targetWords.
    coinsForWords(words) {
        if (words <= 0) return 0;
        const fraction = Math.min(1, words / this.targetWords);
        return Math.max(1, Math.round(this.maxCoins * fraction * fraction));
    }

    handleCorrectWord(scene) {
        this.correctWords += 1;
        this.earnedCoins = this.coinsForWords(this.correctWords);
        this.updateProgressBar();

        this.mic.setState('correct');
        this.showSuccessParticles(scene, scene.cameras.main.width / 2, WORD_Y, { scale: 1.5, lifespan: 500 });

        // Reached the target — end early on a high note.
        if (this.correctWords >= this.targetWords) {
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
        this.mic.setState('wrong');
        // Keep the same word — the listening loop restarts automatically so the
        // child can simply try reading it again. (The word is not played back:
        // the open microphone would hear it and count it.)
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

    stopTimer() {
        if (this.timerEvent) {
            this.timerEvent.remove();
            this.timerEvent = null;
        }
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
        // The bar tracks words (steady progress); the number shows the accelerating coins.
        const fraction = Math.min(1, this.correctWords / this.targetWords);
        this.progressBarFill.width = this.progressBarWidth * fraction;
        if (this.coinCountText) this.coinCountText.setText(`${this.earnedCoins}`);
    }

    finishGame(scene) {
        if (!this.gameActive) return;
        this.gameActive = false;
        this.finished = true;
        this.inputLocked = true;

        this.stopTimer();
        this.speechHelper.stopListening();

        // The microphone is done for this round.
        if (this.mic) this.mic.setState('idle');

        // Hand the earned coins to the scene for the reward animation.
        this.delayedCall(scene, 900, () => {
            const x = scene.cameras.main.width / 2;
            const y = scene.cameras.main.height / 2;
            this.finish(true, this.challengeData.word, x, y);
        });
    }

    cleanup(scene) {
        this.gameActive = false;
        this.stopTimer();

        // abort() tears the capture session down immediately; stop() waits
        // for final results and can leave the mic open on iOS.
        this.speechHelper.cleanup();

        // Destroys uiElements and cancels the restart/finish/particle timers
        // and the ring tween, so nothing from this round can fire later.
        super.cleanup(scene);

        this.wordText = null;
        this.mic = null;
        this.micButton = null;
        this.timerBarFill = null;
        this.progressBarFill = null;
        this.coinCountText = null;
    }
}
