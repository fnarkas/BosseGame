import Phaser from 'phaser';

export class PokedexScene extends Phaser.Scene {
    constructor() {
        super({ key: 'PokedexScene' });
        this.scrollY = 0;
        this.maxScroll = 0;
        this.isDragging = false;
        this.dragStartY = 0;
        this.scrollStartY = 0;
    }

    create() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        // Background (fixed)
        this.add.rectangle(0, 0, width, height, 0x2C3E50).setOrigin(0).setDepth(0);

        // Title (fixed)
        this.add.text(width / 2, 40, 'Min Pokedex', {
            font: 'bold 48px Arial',
            fill: '#FFD700',
            stroke: '#000000',
            strokeThickness: 6
        }).setOrigin(0.5).setDepth(100);

        // Back button (fixed)
        const backBtn = this.add.text(20, 20, '← Tillbaka', {
            font: '24px Arial',
            fill: '#ffffff',
            backgroundColor: '#FF6B6B',
            padding: { x: 15, y: 10 }
        }).setInteractive().setDepth(100);

        backBtn.on('pointerdown', () => {
            this.scene.start('MainGameScene');
        });

        // Get caught Pokemon
        const caughtPokemon = this.registry.get('caughtPokemon') || [];
        const caughtIds = new Set(caughtPokemon.map(p => p.id));

        // Create scrollable container for Pokemon grid
        this.scrollContainer = this.add.container(0, 0);
        this.scrollContainer.setDepth(1);

        // Display all Pokemon (caught and uncaught)
        this.displayAllPokemon(caughtIds);

        // Show stats (fixed)
        this.add.text(width / 2, height - 40, `Fångade: ${caughtPokemon.length} / 100`, {
            font: '28px Arial',
            fill: '#ffffff'
        }).setOrigin(0.5).setDepth(100);

        // Set up scrolling with mouse wheel
        this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY, deltaZ) => {
            this.scroll(deltaY * 0.5);
        });

        // Set up drag scrolling
        this.input.on('pointerdown', (pointer) => {
            if (pointer.y > 100 && pointer.y < height - 80) { // Only in scrollable area
                this.isDragging = true;
                this.dragStartY = pointer.y;
                this.scrollStartY = this.scrollY;
            }
        });

        this.input.on('pointermove', (pointer) => {
            if (this.isDragging) {
                const delta = pointer.y - this.dragStartY;
                this.scrollY = this.scrollStartY - delta;
                this.scrollY = Phaser.Math.Clamp(this.scrollY, 0, this.maxScroll);
                this.scrollContainer.y = -this.scrollY;
            }
        });

        this.input.on('pointerup', () => {
            this.isDragging = false;
        });
    }

    scroll(delta) {
        this.scrollY += delta;
        this.scrollY = Phaser.Math.Clamp(this.scrollY, 0, this.maxScroll);
        this.scrollContainer.y = -this.scrollY;
    }

    displayAllPokemon(caughtIds) {
        const startX = 150;
        const startY = 120;
        const itemWidth = 200;
        const itemHeight = 250; // Increased height for type icons
        const cols = 4; // 4 Pokemon per row
        const spacing = 30;

        // Display all 100 Pokemon
        POKEMON_DATA.forEach((pokemon, index) => {
            const row = Math.floor(index / cols);
            const col = index % cols;

            const x = startX + col * (itemWidth + spacing);
            const y = startY + row * (itemHeight + spacing);

            const isCaught = caughtIds.has(pokemon.id);

            // Container background
            const bgColor = isCaught ? 0x34495E : 0x1A252F;
            const borderColor = isCaught ? 0xFFD700 : 0x546E7A;
            const bg = this.add.rectangle(x, y, itemWidth, itemHeight, bgColor);
            bg.setStrokeStyle(3, borderColor);
            this.scrollContainer.add(bg);

            // Pokemon image
            if (this.textures.exists(`pokemon_${pokemon.id}`)) {
                const sprite = this.add.image(x, y - 30, `pokemon_${pokemon.id}`);
                sprite.setScale(0.35);

                if (!isCaught) {
                    // Apply silhouette effect for uncaught Pokemon
                    sprite.setTint(0x000000);
                    sprite.setAlpha(0.5);
                }

                this.scrollContainer.add(sprite);
            }

            // Pokemon name
            const nameText = this.add.text(x, y + 70, isCaught ? pokemon.name : '???', {
                font: isCaught ? 'bold 18px Arial' : '18px Arial',
                fill: isCaught ? '#ffffff' : '#7F8C8D',
                align: 'center'
            }).setOrigin(0.5);
            this.scrollContainer.add(nameText);

            // Pokemon number
            const numberText = this.add.text(x, y + 92, `#${String(pokemon.id).padStart(3, '0')}`, {
                font: '16px Arial',
                fill: isCaught ? '#95A5A6' : '#546E7A'
            }).setOrigin(0.5);
            this.scrollContainer.add(numberText);

            // Pokeball icon for caught Pokemon
            if (isCaught) {
                const pokeballIcon = this.add.text(x - 85, y - 95, '⚪', {
                    font: '20px Arial'
                });
                this.scrollContainer.add(pokeballIcon);

                // Speaker button to play Pokemon name audio
                const speakerBtn = this.add.text(x + 75, y + 70, '🔊', {
                    font: '28px Arial',
                    padding: { y: 7 }
                }).setOrigin(0.5).setInteractive({ useHandCursor: true });

                // Hover effect
                speakerBtn.on('pointerover', () => {
                    speakerBtn.setScale(1.2);
                });

                speakerBtn.on('pointerout', () => {
                    speakerBtn.setScale(1.0);
                });

                // Play audio on click
                speakerBtn.on('pointerdown', () => {
                    // Visual feedback
                    speakerBtn.setScale(0.9);
                    this.time.delayedCall(100, () => {
                        speakerBtn.setScale(1.0);
                    });

                    // Play Pokemon name audio
                    this.sound.play(`pokemon_audio_${pokemon.id}`);
                });

                this.scrollContainer.add(speakerBtn);
            }

            // Type icons for ALL Pokemon (from local POKEMON_DATA)
            const types = pokemon.types;
            if (types && types.length > 0) {
                const typeIconSize = 30;
                const typeSpacing = 8;
                const numTypes = types.length;
                const totalTypeWidth = numTypes * typeIconSize + (numTypes - 1) * typeSpacing;
                const typeStartX = x - totalTypeWidth / 2;
                const typeY = y + 112; // Positioned below the number label

                types.forEach((typeId, typeIndex) => {
                    const typeX = typeStartX + typeIndex * (typeIconSize + typeSpacing);
                    const typeIcon = this.add.image(typeX, typeY, `type_${typeId}`);
                    typeIcon.setScale(1.0); // Display at full size since they're now circular and compact

                    // Fade uncaught Pokemon type icons
                    if (!isCaught) {
                        typeIcon.setAlpha(0.3);
                    }

                    this.scrollContainer.add(typeIcon);
                });
            }
        });

        // Calculate max scroll based on content height
        const totalRows = Math.ceil(POKEMON_DATA.length / cols);
        const contentHeight = startY + totalRows * (itemHeight + spacing);
        this.maxScroll = Math.max(0, contentHeight - this.cameras.main.height + 100);
    }
}
