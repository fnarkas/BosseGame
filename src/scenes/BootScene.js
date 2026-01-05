import Phaser from 'phaser';
import { SWEDISH_LETTERS } from '../letterData.js';

export class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BootScene' });
    }

    preload() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        // Loading emoji
        const loadingEmoji = this.add.text(width / 2, height / 2 - 80, '⚡', {
            font: '120px Arial'
        });
        loadingEmoji.setOrigin(0.5, 0.5);

        // Progress bar
        const progressBar = this.add.graphics();
        const progressBox = this.add.graphics();
        progressBox.fillStyle(0x222222, 0.8);
        progressBox.fillRect(width / 2 - 160, height / 2, 320, 50);

        // Update progress bar
        this.load.on('progress', (value) => {
            progressBar.clear();
            progressBar.fillStyle(0xffffff, 1);
            progressBar.fillRect(width / 2 - 150, height / 2 + 10, 300 * value, 30);
        });

        this.load.on('complete', () => {
            progressBar.destroy();
            progressBox.destroy();
            loadingEmoji.destroy();
        });

        // Load all Pokemon images
        this.loadPokemonImages();

        // Load pokeball sprites
        this.loadPokeballSprites();

        // Load coin sprite
        this.load.image('coin', 'coin.png');

        // Load tiny coin sprite for inventory (64x64)
        this.load.image('coin-tiny', 'coin-tiny.png');

        // Load UI button icons (optimized 128x128 versions)
        this.load.image('dice-icon', 'dice-icon-small.png');
        this.load.image('pokedex-icon', 'pokedex-icon-small.png');
        this.load.image('store-icon', 'store-icon-small.png');

        // Load type icons
        this.loadTypeIcons();

        // Load Pokemon name audio
        this.loadPokemonAudio();

        // Load Swedish letter audio
        this.loadLetterAudio();

        // Load direction audio
        this.loadDirectionAudio();
    }

    loadPokemonImages() {
        // Load all 100 Pokemon images using POKEMON_DATA
        POKEMON_DATA.forEach(pokemon => {
            this.load.image(`pokemon_${pokemon.id}`, `pokemon_images/${pokemon.filename}`);
        });
    }

    loadPokeballSprites() {
        // Load optimized 128x128 pokeball sprites (converted from high-quality webp)
        this.load.image('pokeball_poke-ball', 'pokeball_sprites/poke-ball-small.png');
        this.load.image('pokeball_great-ball', 'pokeball_sprites/great-ball-small.png');
        this.load.image('pokeball_ultra-ball', 'pokeball_sprites/ultra-ball-small.png');

        // Load tiny 64x64 pokeball sprites for inventory
        this.load.image('pokeball_poke-ball-tiny', 'pokeball_sprites/poke-ball-tiny.png');
        this.load.image('pokeball_great-ball-tiny', 'pokeball_sprites/great-ball-tiny.png');
        this.load.image('pokeball_ultra-ball-tiny', 'pokeball_sprites/ultra-ball-tiny.png');

        // Load old PNG pokeball sprites (for other types)
        const otherPokeballs = [
            'master-ball',
            'safari-ball',
            'net-ball',
            'dive-ball',
            'nest-ball',
            'repeat-ball',
            'timer-ball',
            'luxury-ball',
            'premier-ball',
            'dusk-ball',
            'heal-ball',
            'quick-ball',
            'cherish-ball'
        ];

        otherPokeballs.forEach(ballName => {
            this.load.image(`pokeball_${ballName}`, `pokeball_sprites/${ballName}.png`);
        });
    }

    loadTypeIcons() {
        // Load type icons (IDs 1-18) - using circular versions without text
        for (let typeId = 1; typeId <= 18; typeId++) {
            this.load.image(`type_${typeId}`, `type_icons_circular/${typeId}.png`);
        }
    }

    loadPokemonAudio() {
        // Load Pokemon name audio for all 100 Pokemon
        POKEMON_DATA.forEach(pokemon => {
            const audioFilename = `${pokemon.id.toString().padStart(3, '0')}_${pokemon.name.toLowerCase().replace('-', '')}.mp3`;
            const audioKey = `pokemon_audio_${pokemon.id}`;
            this.load.audio(audioKey, `pokemon_audio/${audioFilename}`);
        });
    }

    loadLetterAudio() {
        // Load Swedish letter audio for all 29 letters
        SWEDISH_LETTERS.forEach(letter => {
            const audioKey = `letter_audio_${letter.toLowerCase()}`;
            const audioFilename = `${letter.toLowerCase()}.mp3`;
            this.load.audio(audioKey, `letter_audio/${audioFilename}`);
        });
    }

    loadDirectionAudio() {
        // Load direction audio (höger, vänster)
        const directions = ['hoger', 'vanster'];
        directions.forEach(direction => {
            const audioKey = `direction_audio_${direction}`;
            const audioFilename = `${direction}.mp3`;
            this.load.audio(audioKey, `direction_audio/${audioFilename}`);
        });
    }

    create() {
        // Store game data globally
        this.registry.set('caughtPokemon', this.loadCaughtPokemon());

        // Start the appropriate scene based on URL routing
        const startScene = this.registry.get('startScene') || 'MainGameScene';
        this.scene.start(startScene);
    }

    loadCaughtPokemon() {
        const saved = localStorage.getItem('pokemonCaughtList');
        return saved ? JSON.parse(saved) : [];
    }
}
