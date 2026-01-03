import Phaser from 'phaser';

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

        // Load type icons
        this.loadTypeIcons();

        // Load Pokemon name audio
        this.loadPokemonAudio();
    }

    loadPokemonImages() {
        // Load all 100 Pokemon images using POKEMON_DATA
        POKEMON_DATA.forEach(pokemon => {
            this.load.image(`pokemon_${pokemon.id}`, `pokemon_images/${pokemon.filename}`);
        });
    }

    loadPokeballSprites() {
        // Load pokeball sprites
        const pokeballs = [
            'poke-ball',
            'great-ball',
            'ultra-ball',
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

        pokeballs.forEach(ballName => {
            this.load.image(`pokeball_${ballName}`, `pokeball_sprites/${ballName}.png`);
        });
    }

    loadTypeIcons() {
        // Load type icons (IDs 1-18)
        for (let typeId = 1; typeId <= 18; typeId++) {
            this.load.image(`type_${typeId}`, `type_icons/${typeId}.png`);
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

    create() {
        // Store game data globally
        this.registry.set('caughtPokemon', this.loadCaughtPokemon());
        this.registry.set('pokeballCount', this.loadPokeballCount());

        // Start the appropriate scene based on URL routing
        const startScene = this.registry.get('startScene') || 'MainGameScene';
        this.scene.start(startScene);
    }

    loadCaughtPokemon() {
        const saved = localStorage.getItem('pokemonCaughtList');
        return saved ? JSON.parse(saved) : [];
    }

    loadPokeballCount() {
        const saved = localStorage.getItem('pokeballCount');
        if (saved !== null) {
            return parseInt(saved, 10);
        }
        // Give 5 starter pokeballs for new players
        const starterBalls = 5;
        localStorage.setItem('pokeballCount', starterBalls.toString());
        return starterBalls;
    }
}
