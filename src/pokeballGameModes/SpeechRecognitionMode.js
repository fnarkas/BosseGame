import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { getRandomWord, getRandomSentence } from '../speechVocabulary.js';
import { trackWrongAnswer } from '../wrongAnswers.js';
import { getWordAudioKey } from '../wordAudioData.js';
import { SpeechRecognitionHelper } from '../utils/speechRecognitionHelper.js';
import { createMicButton } from '../components/MicButton.js';

// ⚙️ CONFIGURATION: How many words must be read correctly to win
const REQUIRED_CORRECT_WORDS = 1; // Change this number: 1 = easy, 3 = medium, 5 = hard

const WORD_Y = 250;
const MIC_Y = 450;
const BALLS_Y = 650;

/**
 * Speech Recognition Reading game mode
 * Player sees a Swedish word, reads it aloud, and system validates pronunciation.
 *
 * The microphone is only ever opened when the child taps the mic button: on
 * iOS any eager capture flips the audio session into a heavily attenuated
 * play-and-record mode that sticks for the life of the tab (see micSession.js).
 * All microphone state is shown on the button itself (see MicButton.js);
 * there is no status text, because the child cannot read.
 */
export class SpeechRecognitionMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.currentWord = null;
        this.correctCount = 0;
        this.requiredCorrect = REQUIRED_CORRECT_WORDS; // Configurable requirement
        this.isSentence = false; // Track if current challenge is a sentence
        this.wordText = null;    // Reference to displayed text
        this.mic = null;         // MicButton api
        this.micButton = null;   // The tappable circle (mic.button)
        this.speechHelper = new SpeechRecognitionHelper('sv-SE');
    }

    get micState() {
        return this.mic ? this.mic.state : 'idle';
    }

    generateChallenge() {
        // A word the child stumbled on comes back a little later.
        const retry = this.takeRetry();
        if (retry) {
            this.isSentence = retry.isSentence;
            this.challengeData = { word: retry.word, translation: retry.translation };
            return;
        }

        // 50% chance for word, 50% for sentence
        this.isSentence = Math.random() < 0.5;

        if (this.isSentence) {
            const sentenceData = getRandomSentence('easy');
            this.challengeData = {
                word: sentenceData.sentence,
                translation: sentenceData.translation
            };
        } else {
            this.currentWord = getRandomWord('easy');
            this.challengeData = {
                word: this.currentWord.word,
                translation: this.currentWord.translation
            };
        }
    }

    createChallengeUI(scene) {
        const width = scene.cameras.main.width;

        // A fresh challenge always starts accepting input again.
        this.inputLocked = false;

        // Display the word/sentence to read (LARGE and clear)
        this.wordText = scene.add.text(width / 2, WORD_Y, this.challengeData.word.toUpperCase(), {
            fontSize: this.isSentence ? '60px' : '120px',
            fontFamily: 'Arial',
            color: '#2C3E50',
            fontStyle: 'bold',
            stroke: '#FFFFFF',
            strokeThickness: this.isSentence ? 4 : 8,
            wordWrap: { width: width - 100 },
            align: 'center'
        });
        this.wordText.setOrigin(0.5);
        this.uiElements.push(this.wordText);

        // Microphone button (large, centered). Grey and dead until speech
        // recognition exists.
        this.mic = createMicButton(scene, this, {
            x: width / 2,
            y: MIC_Y,
            onTap: () => this.onMicTap(scene)
        });
        this.micButton = this.mic.button;

        this.createProgressBalls(scene, { total: this.requiredCorrect, completed: this.correctCount, y: BALLS_Y });

        this.initializeSpeechRecognition(scene);
    }

    initializeSpeechRecognition(scene) {
        const helper = this.speechHelper;

        helper.onResult = (transcript, results) => {
            // An answer is already accepted and its feedback is running; a
            // second utterance must not count again.
            if (this.inputLocked) return;
            console.log('Heard:', transcript, 'Expected:', this.challengeData.word);
            this.handleSpeechResult(scene, transcript, results);
        };
        helper.onError = (error) => {
            if (!this.mic) return;
            if (error === 'not-allowed' || error === 'service-not-allowed' || error === 'audio-capture') {
                // Still tappable: a tap retries and the browser prompts again.
                this.mic.setState('blocked');
            } else if (this.micState === 'listening') {
                this.mic.setState('idle');
            }
        };
        helper.onStart = () => {
            if (this.mic && !this.inputLocked) this.mic.setState('listening');
        };
        helper.onEnd = () => {
            // Keep ✅/❌ on screen; only a plain listening session goes idle.
            if (this.mic && this.micState === 'listening') this.mic.setState('idle');
        };
        // The helper reports its state as text; the child can't read it, so
        // the only thing taken from it is "the session stopped on its own"
        // (the silence timeout), which turns the button grey again.
        helper.onStatusChange = () => {
            if (this.mic && !helper.isListening && this.micState === 'listening') this.mic.setState('idle');
        };

        // The recognizer is created synchronously; the network probe the
        // helper runs afterwards is only advisory, so the button is usable at
        // once. No microphone is opened here.
        helper.initialize(scene);
        if (!helper.recognition) {
            this.mic.setState('blocked');
            return;
        }
        this.mic.enable();
        this.mic.setState('idle');
    }

    onMicTap(scene) {
        // Ignore taps while a correct answer's feedback is running.
        if (this.isInputBlocked() || this.speechHelper.isListening) return;
        if (this.speechHelper.startListening(scene)) {
            this.mic.setState('listening');
        } else {
            this.mic.setState('idle');
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
        // Lock out further taps/results until the next word is up (or the
        // reward is handed over) so one word can never count twice.
        this.inputLocked = true;
        this.mic.setState('correct');

        this.correctCount++;
        this.updateProgressBalls(this.correctCount);

        this.showSuccessParticles(scene, scene.cameras.main.width / 2, MIC_Y, { quantity: 20 });

        if (this.correctCount >= this.requiredCorrect) {
            this.delayedCall(scene, 1000, () => {
                const x = scene.cameras.main.width / 2;
                const y = scene.cameras.main.height / 2;
                this.finish(true, this.challengeData.word, x, y);
            });
        } else {
            this.delayedCall(scene, 1500, () => {
                this.loadNextWord(scene);
            });
        }
    }

    handleWrongAnswer(scene, transcript) {
        trackWrongAnswer(
            'SpeechRecognitionMode',
            this.challengeData.word,
            transcript
        );

        this.mic.setState('wrong');
        // Let the child hear how the word sounds before trying again, and
        // bring it back a couple of words later.
        this.playAnswerAudio(scene);
        const { word, translation } = this.challengeData;
        if (!this.retryQueue.some(entry => entry.item.word === word)) {
            this.queueRetry({ word, translation, isSentence: this.isSentence }, 2);
        }

        // Back to "tap to talk" (unless the child already tapped again)
        this.delayedCall(scene, 2000, () => {
            if (this.mic && this.micState === 'wrong') this.mic.setState('idle');
        });
    }

    // The word, or the words of the sentence stitched together.
    playAnswerAudio(scene) {
        const keys = this.challengeData.word.toLowerCase().split(' ').filter(Boolean).map(getWordAudioKey);
        this.playSequence(scene, keys);
    }

    loadNextWord(scene) {
        // The next word is answerable again.
        this.inputLocked = false;

        this.generateChallenge();

        // Update text with proper styling for word vs sentence
        if (this.wordText) {
            this.wordText.setText(this.challengeData.word.toUpperCase());
            this.wordText.setFontSize(this.isSentence ? '60px' : '120px');
            this.wordText.setStroke('#FFFFFF', this.isSentence ? 4 : 8);
        }
        if (this.mic) this.mic.setState(this.speechHelper.recognition ? 'idle' : 'blocked');
    }

    cleanup(scene) {
        // Tear the capture session down immediately (abort, not stop) so the
        // microphone can never be left open when the mode goes away.
        this.speechHelper.cleanup();

        // Destroys uiElements and cancels every pending timer (next word,
        // reward hand-over, particle self-destruct) and the ring tween.
        super.cleanup(scene);

        // Drop the references so a late recognition onend/onerror (abort()
        // fires them asynchronously) can't touch destroyed objects.
        this.wordText = null;
        this.mic = null;
        this.micButton = null;
    }
}
