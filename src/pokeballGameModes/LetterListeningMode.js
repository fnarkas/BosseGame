import { BasePokeballGameMode } from './BasePokeballGameMode.js';
import { getConfiguredLetters } from '../letterData.js';
import { trackWrongAnswer } from '../wrongAnswers.js';
import { pickAdaptive, pickDistractors, HARD_LETTERS } from '../adaptive.js';
import { COLORS, TEXT, wireButtonHover } from './uiKit.js';

const MODE_NAME = 'LetterListeningMode';

/**
 * Letter Listening game mode
 * Player hears a Swedish letter and must select the correct letter from choices
 */
export class LetterListeningMode extends BasePokeballGameMode {
    constructor() {
        super();
        this.usedLetters = new Set();
        this.hasError = false; // Track if player made an error
        this.letterButtons = []; // Store button references
        this.correctInRow = 0; // Track consecutive correct answers
        this.requiredCorrect = 3; // Need 3 correct to get Pokemon
        // Start with default letters, will be updated when config is loaded
        this.availableLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
            'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'Å', 'Ä', 'Ö'];
        this.configLoaded = false;
    }

    async loadConfig() {
        this.availableLetters = await getConfiguredLetters();
        this.configLoaded = true;
        console.log('LetterListeningMode loaded with letters:', this.availableLetters);
    }

    generateChallenge() {
        // A letter the child just missed comes straight back; otherwise pick
        // from the unused letters, favouring the ones he mixes up.
        const retry = this.takeRetry();
        let correctLetter = retry && this.availableLetters.includes(retry) ? retry : null;

        if (!correctLetter) {
            let unused = this.availableLetters.filter(letter => !this.usedLetters.has(letter));
            if (unused.length === 0) {
                this.usedLetters.clear();
                unused = [...this.availableLetters];
            }
            correctLetter = pickAdaptive(MODE_NAME, unused, { seedList: HARD_LETTERS });
        }
        this.usedLetters.add(correctLetter);

        // 5 distractors: the confusable partner(s) first (b next to d), then
        // random fillers from the configured letters.
        const distractors = pickDistractors(MODE_NAME, correctLetter, this.availableLetters, 5);
        const shuffledChoices = Phaser.Utils.Array.Shuffle([correctLetter, ...distractors]);

        this.challengeData = {
            correctLetter: correctLetter,
            letters: shuffledChoices
        };

        return this.challengeData;
    }

    createChallengeUI(scene) {
        const width = scene.cameras.main.width;

        // A fresh challenge always starts accepting input again.
        this.inputLocked = false;
        this.isRevealing = false;

        // Play the letter audio automatically
        this.playLetterAudio(scene, this.challengeData.correctLetter);

        // Speaker button to replay audio (larger, centered)
        this.createSpeakerButton(scene, width / 2, 180, () => {
            this.playLetterAudio(scene, this.challengeData.correctLetter);
        });

        // Progress balls showing how many in a row so far
        this.createProgressBalls(scene, { total: this.requiredCorrect, completed: this.correctInRow, y: 310 });

        // Create letter buttons in a grid (2 rows of 3)
        const letterButtonSize = 100;
        const letterSpacing = 30;
        const cols = 3;

        const gridWidth = cols * (letterButtonSize + letterSpacing) - letterSpacing;
        const startX = (width - gridWidth) / 2 + letterButtonSize / 2;
        const startY = 400;

        this.challengeData.letters.forEach((letter, index) => {
            const row = Math.floor(index / cols);
            const col = index % cols;
            const x = startX + col * (letterButtonSize + letterSpacing);
            const y = startY + row * (letterButtonSize + letterSpacing);

            // Background button
            const button = scene.add.rectangle(x, y, letterButtonSize, letterButtonSize, COLORS.NEUTRAL_FILL);
            button.setStrokeStyle(4, COLORS.NEUTRAL_STROKE);
            button.setInteractive({ useHandCursor: true });
            button.setData('letter', letter);
            this.uiElements.push(button);

            // Letter text
            const letterText = scene.add.text(x, y, letter, TEXT.big).setOrigin(0.5);
            this.uiElements.push(letterText);

            // Store button reference
            this.letterButtons.push({ button, letterText, letter, x, y });

            wireButtonHover(button, () => this.isInputBlocked());

            // Click handler
            button.on('pointerdown', () => {
                // Ignore taps during the reveal and while an answer is being resolved
                if (this.isInputBlocked()) return;
                this.inputLocked = true;

                const isCorrect = this.checkAnswer(letter);

                if (!isCorrect) {
                    // Wrong answer - show error feedback then highlight correct answer
                    this.showWrongAnswerFeedback(scene, button);
                } else {
                    // Correct answer!
                    this.correctInRow++;
                    this.updateProgressBalls(this.correctInRow);

                    // Show success feedback
                    button.setFillStyle(COLORS.CORRECT, 0.5);
                    button.setStrokeStyle(6, COLORS.CORRECT);

                    // Check if won
                    if (this.correctInRow >= this.requiredCorrect) {
                        // Player got 3 in a row! Give Pokemon
                        this.delayedCall(scene, 500, () => {
                            this.finish(true, letter, x, y);
                        });
                    } else {
                        // Continue to next challenge
                        this.delayedCall(scene, 800, () => {
                            this.cleanup(scene);
                            this.generateChallenge();
                            this.createChallengeUI(scene);
                        });
                    }
                }
            });
        });
    }

    playLetterAudio(scene, letter) {
        this.playAudio(scene, `letter_audio_${letter.toLowerCase()}`);
    }

    checkAnswer(selectedLetter) {
        return selectedLetter === this.challengeData.correctLetter;
    }

    showWrongAnswerFeedback(scene, wrongButton) {
        // Track wrong answer
        const wrongLetter = wrongButton.getData('letter');
        trackWrongAnswer(
            MODE_NAME,
            this.challengeData.correctLetter,
            wrongLetter
        );

        // Reset progress
        this.correctInRow = 0;
        this.updateProgressBalls(0);

        // Red shake on the wrong button, then ONE ERROR = GAME OVER:
        // highlight and say the correct answer.
        this.shakeWrong(scene, wrongButton, {
            onComplete: () => this.highlightCorrectAnswer(scene)
        });
    }

    highlightCorrectAnswer(scene) {
        const correctLetter = this.challengeData.correctLetter;
        const correctButton = this.letterButtons.find(item => item.letter === correctLetter);

        // Ask the missed letter again right away, and once more a bit later.
        this.queueRetry(correctLetter);
        this.queueRetry(correctLetter, 2);

        // Gold pulse on the right letter while it is spoken; after 2 seconds
        // the streak is reset and a new challenge starts.
        this.revealAnswer(scene, {
            targets: correctButton ? [correctButton.button, correctButton.letterText] : [],
            disable: this.letterButtons.map(item => item.button),
            audioKey: `letter_audio_${correctLetter.toLowerCase()}`
        });
    }

    cleanup(scene) {
        super.cleanup(scene);
        this.letterButtons = [];
    }
}
