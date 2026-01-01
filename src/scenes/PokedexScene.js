import Phaser from 'phaser';

export class PokedexScene extends Phaser.Scene {
    constructor() {
        super({ key: 'PokedexScene' });
    }

    create() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        // Background
        this.add.rectangle(0, 0, width, height, 0x2C3E50).setOrigin(0);

        // Title
        this.add.text(width / 2, 40, 'Min Pokedex', {
            font: 'bold 48px Arial',
            fill: '#FFD700',
            stroke: '#000000',
            strokeThickness: 6
        }).setOrigin(0.5);

        // Back button
        const backBtn = this.add.text(20, 20, '← Tillbaka', {
            font: '24px Arial',
            fill: '#ffffff',
            backgroundColor: '#FF6B6B',
            padding: { x: 15, y: 10 }
        }).setInteractive();

        backBtn.on('pointerdown', () => {
            this.scene.start('MainGameScene');
        });

        // Get caught Pokemon
        const caughtPokemon = this.registry.get('caughtPokemon') || [];

        if (caughtPokemon.length === 0) {
            this.add.text(width / 2, height / 2, 'Du har inte fångat några Pokemon än!\nGå och fånga några!', {
                font: '32px Arial',
                fill: '#ffffff',
                align: 'center'
            }).setOrigin(0.5);
        } else {
            // Display caught Pokemon in a grid
            this.displayCaughtPokemon(caughtPokemon);
        }

        // Show stats
        this.add.text(width / 2, height - 40, `Fångade: ${caughtPokemon.length} / 100`, {
            font: '28px Arial',
            fill: '#ffffff'
        }).setOrigin(0.5);
    }

    displayCaughtPokemon(caughtPokemon) {
        const startX = 100;
        const startY = 120;
        const itemWidth = 150;
        const itemHeight = 180;
        const cols = 6;
        const spacing = 20;

        caughtPokemon.forEach((pokemon, index) => {
            const row = Math.floor(index / cols);
            const col = index % cols;

            const x = startX + col * (itemWidth + spacing);
            const y = startY + row * (itemHeight + spacing);

            // Container background
            const bg = this.add.rectangle(x, y, itemWidth, itemHeight, 0x34495E);
            bg.setStrokeStyle(3, 0xFFD700);

            // Pokemon image
            if (this.textures.exists(`pokemon_${pokemon.id}`)) {
                const sprite = this.add.image(x, y - 20, `pokemon_${pokemon.id}`);
                sprite.setScale(0.3);
            }

            // Pokemon name
            this.add.text(x, y + 60, pokemon.name, {
                font: '16px Arial',
                fill: '#ffffff',
                align: 'center'
            }).setOrigin(0.5);

            // Pokemon number
            this.add.text(x, y + 80, `#${pokemon.id}`, {
                font: '14px Arial',
                fill: '#95A5A6'
            }).setOrigin(0.5);
        });
    }
}
