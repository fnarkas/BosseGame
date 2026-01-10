/**
 * Reusable Letter Keyboard Component
 * Creates a Swedish alphabet keyboard for letter input games
 */

const SWEDISH_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖ'.split('');

/**
 * Create letter keyboard
 * @param {Phaser.Scene} scene - The Phaser scene
 * @param {Object} config - Configuration options
 * @param {number} config.startY - Y position for keyboard (default: 600)
 * @param {string[]} config.usedLetters - Letters to disable (default: [])
 * @param {Function} config.onLetterClick - Callback when letter clicked (letter) => void
 * @param {string} config.alphabetCase - 'uppercase' or 'lowercase' (default: 'uppercase')
 * @param {boolean} config.clearOnNewEncounter - Add clearOnNewEncounter data flag (default: true)
 * @returns {Object} { elements: [], letterButtons: [] } - UI elements and button references
 */
export function createLetterKeyboard(scene, config = {}) {
    const {
        startY = 600,
        usedLetters = [],
        onLetterClick = null,
        alphabetCase = 'uppercase',
        clearOnNewEncounter = true
    } = config;

    const width = scene.cameras.main.width;
    const buttonWidth = 50;
    const buttonHeight = 50;
    const spacing = 10;
    const lettersPerRow = 10;

    const elements = [];
    const letterButtons = [];

    SWEDISH_ALPHABET.forEach((letter, index) => {
        const row = Math.floor(index / lettersPerRow);
        const col = index % lettersPerRow;

        const x = width / 2 - (lettersPerRow * (buttonWidth + spacing)) / 2 + col * (buttonWidth + spacing) + buttonWidth / 2;
        const y = startY + row * (buttonHeight + spacing);

        const isUsed = usedLetters.includes(letter);
        const bgColor = isUsed ? 0x666666 : 0x4CAF50;

        const button = scene.add.rectangle(x, y, buttonWidth, buttonHeight, bgColor);
        button.setStrokeStyle(2, 0x000000);
        if (clearOnNewEncounter) {
            button.setData('clearOnNewEncounter', true);
        }
        button.setData('letter', letter);
        elements.push(button);

        // Apply case transformation
        const displayLetter = alphabetCase === 'uppercase' ? letter : letter.toLowerCase();

        const text = scene.add.text(x, y, displayLetter, {
            font: 'bold 24px Arial',
            fill: isUsed ? '#999999' : '#ffffff'
        }).setOrigin(0.5);
        if (clearOnNewEncounter) {
            text.setData('clearOnNewEncounter', true);
        }
        elements.push(text);

        // Store button data
        const buttonData = {
            button,
            text,
            letter,
            x,
            y,
            isUsed
        };
        letterButtons.push(buttonData);

        if (!isUsed) {
            button.setInteractive({ useHandCursor: true });

            button.on('pointerover', () => {
                button.setFillStyle(0x66BB6A);
            });

            button.on('pointerout', () => {
                button.setFillStyle(0x4CAF50);
            });

            button.on('pointerdown', () => {
                if (onLetterClick) {
                    onLetterClick(letter);
                }
            });
        }
    });

    return {
        elements,
        letterButtons
    };
}

/**
 * Update keyboard to reflect new used letters
 * @param {Array} letterButtons - Button data from createLetterKeyboard
 * @param {string[]} usedLetters - Letters to mark as used
 */
export function updateLetterKeyboard(letterButtons, usedLetters) {
    letterButtons.forEach(({ button, text, letter }) => {
        const isUsed = usedLetters.includes(letter);

        if (isUsed) {
            button.setFillStyle(0x666666);
            text.setColor('#999999');
            button.disableInteractive();
        } else {
            button.setFillStyle(0x4CAF50);
            text.setColor('#ffffff');
            button.setInteractive({ useHandCursor: true });
        }
    });
}

/**
 * Destroy keyboard elements
 * @param {Array} elements - Elements array from createLetterKeyboard
 */
export function destroyLetterKeyboard(elements) {
    elements.forEach(element => {
        if (element && element.destroy) {
            element.destroy();
        }
    });
}
