import Phaser from 'phaser';

export class MainGameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainGameScene' });
        this.swedishAlphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖ'.split('');
        this.currentPokemon = null;
        this.currentLetter = null;
        this.attemptsLeft = 3;
        this.usedLetters = [];
    }

    create() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        // Background
        this.add.rectangle(0, 0, width, height, 0x87CEEB).setOrigin(0);

        // Pokedex button (emoji only)
        const pokedexBtn = this.add.text(width - 20, 20, '📖', {
            font: '64px Arial',
            fill: '#ffffff'
        }).setOrigin(1, 0).setInteractive();

        pokedexBtn.on('pointerdown', () => {
            this.scene.start('PokedexScene');
        });

        // Start first encounter
        this.startNewEncounter();
    }

    startNewEncounter() {
        // Reset attempts and used letters
        this.attemptsLeft = 3;
        this.usedLetters = [];

        // Clear previous UI
        this.children.list.forEach(child => {
            if (child.getData && child.getData('clearOnNewEncounter')) {
                child.destroy();
            }
        });

        // Spawn random Pokemon
        this.spawnPokemon();

        // Pick random letter
        this.currentLetter = Phaser.Utils.Array.GetRandom(this.swedishAlphabet);

        // Create UI
        this.createChallengeUI();
    }

    spawnPokemon() {
        const width = this.cameras.main.width;

        // Pick a random Pokemon from all 100
        const randomPokemon = Phaser.Utils.Array.GetRandom(POKEMON_DATA);

        this.currentPokemon = {
            id: randomPokemon.id,
            name: randomPokemon.name
        };

        // Create Pokemon sprite
        const pokemonSprite = this.add.image(width / 2, 250, `pokemon_${randomPokemon.id}`);
        pokemonSprite.setScale(0.5);
        pokemonSprite.setData('clearOnNewEncounter', true);

        // Bounce animation
        this.tweens.add({
            targets: pokemonSprite,
            y: 270,
            duration: 1000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    createChallengeUI() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        // Show attempts
        const heartsText = '❤️'.repeat(this.attemptsLeft) + '🖤'.repeat(3 - this.attemptsLeft);
        this.attemptsDisplay = this.add.text(width / 2, 380, heartsText, {
            font: '36px Arial'
        }).setOrigin(0.5);
        this.attemptsDisplay.setData('clearOnNewEncounter', true);

        // Show lowercase letter
        this.add.text(width / 2, 500, this.currentLetter.toLowerCase(), {
            font: 'bold 72px Arial',
            fill: '#FFD700',
            stroke: '#000000',
            strokeThickness: 6,
            backgroundColor: '#ffffff',
            padding: { x: 30, y: 10 }
        }).setOrigin(0.5).setData('clearOnNewEncounter', true);

        // Create letter buttons (capital letters)
        this.createLetterButtons();
    }

    createLetterButtons() {
        const width = this.cameras.main.width;
        const startY = 600;
        const buttonWidth = 50;
        const buttonHeight = 50;
        const spacing = 10;
        const lettersPerRow = 10;

        this.swedishAlphabet.forEach((letter, index) => {
            const row = Math.floor(index / lettersPerRow);
            const col = index % lettersPerRow;

            const x = width / 2 - (lettersPerRow * (buttonWidth + spacing)) / 2 + col * (buttonWidth + spacing) + buttonWidth / 2;
            const y = startY + row * (buttonHeight + spacing);

            const isUsed = this.usedLetters.includes(letter);
            const bgColor = isUsed ? 0x666666 : 0x4CAF50;

            const button = this.add.rectangle(x, y, buttonWidth, buttonHeight, bgColor);
            button.setStrokeStyle(2, 0x000000);
            button.setData('clearOnNewEncounter', true);

            const text = this.add.text(x, y, letter, {
                font: 'bold 24px Arial',
                fill: isUsed ? '#999999' : '#ffffff'
            }).setOrigin(0.5);
            text.setData('clearOnNewEncounter', true);

            if (!isUsed) {
                button.setInteractive({ useHandCursor: true });

                button.on('pointerover', () => {
                    button.setFillStyle(0x66BB6A);
                });

                button.on('pointerout', () => {
                    button.setFillStyle(0x4CAF50);
                });

                button.on('pointerdown', () => {
                    this.checkAnswer(letter);
                });

                // Store reference for easy update
                button.setData('letter', letter);
                button.setData('textObj', text);
            }
        });
    }

    checkAnswer(selectedLetter) {
        if (selectedLetter === this.currentLetter) {
            // Correct! Catch the Pokemon
            this.catchPokemon();
        } else {
            // Wrong! Add to used letters
            this.usedLetters.push(selectedLetter);
            this.attemptsLeft--;

            if (this.attemptsLeft <= 0) {
                // Pokemon runs away
                this.pokemonRunsAway();
            } else {
                // Update UI
                this.updateAttemptsDisplay();
                this.updateLetterButtons();
            }
        }
    }

    updateAttemptsDisplay() {
        const heartsText = '❤️'.repeat(this.attemptsLeft) + '🖤'.repeat(3 - this.attemptsLeft);
        this.attemptsDisplay.setText(heartsText);
    }

    updateLetterButtons() {
        // Recreate letter buttons with updated used letters
        this.children.list.forEach(child => {
            if (child.getData && child.getData('letter')) {
                child.destroy();
                if (child.getData('textObj')) {
                    child.getData('textObj').destroy();
                }
            }
        });
        this.createLetterButtons();
    }

    catchPokemon() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        // Show success emoji
        const successEmoji = this.add.text(width / 2, height / 2, '🎉✨', {
            font: 'bold 120px Arial'
        }).setOrigin(0.5);

        // Pulse animation
        this.tweens.add({
            targets: successEmoji,
            scale: 1.5,
            duration: 500,
            yoyo: true,
            ease: 'Bounce.easeOut'
        });

        // Save to caught Pokemon
        this.saveCaughtPokemon();

        // Continue after delay
        this.time.delayedCall(2000, () => {
            successEmoji.destroy();
            this.startNewEncounter();
        });
    }

    pokemonRunsAway() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        // Show sad emoji
        const sadEmoji = this.add.text(width / 2, height / 2, '💨😢', {
            font: 'bold 120px Arial'
        }).setOrigin(0.5);

        // Continue after delay
        this.time.delayedCall(2000, () => {
            sadEmoji.destroy();
            this.startNewEncounter();
        });
    }

    saveCaughtPokemon() {
        const caughtList = this.registry.get('caughtPokemon') || [];

        // Check if already caught
        if (!caughtList.find(p => p.id === this.currentPokemon.id)) {
            caughtList.push({
                id: this.currentPokemon.id,
                name: this.currentPokemon.name,
                caughtDate: new Date().toISOString()
            });

            this.registry.set('caughtPokemon', caughtList);
            localStorage.setItem('pokemonCaughtList', JSON.stringify(caughtList));
        }
    }
}
