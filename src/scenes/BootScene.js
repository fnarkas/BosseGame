import Phaser from 'phaser';
import { SWEDISH_LETTERS } from '../letterData.js';
import { getAllWords } from '../speechVocabulary.js';

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
            console.log('All assets loaded. Checking word audio cache...');
            const words = getAllWords();
            words.forEach(wordObj => {
                const audioKey = `word_audio_${wordObj.word}`;
                if (this.cache.audio.exists(audioKey)) {
                    console.log(`✓ ${audioKey} in cache`);
                } else {
                    console.error(`✗ ${audioKey} NOT IN CACHE`);
                }
            });
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

        // Load number audio
        this.loadNumberAudio();

        // Load word audio
        this.loadWordAudio();

        // Load minigame icons (256x256 JPEG)
        this.load.image('game-mode-letter', 'minigame_icons/letter_listening.jpeg');
        this.load.image('game-mode-word', 'minigame_icons/word_emoji_match.jpeg');
        this.load.image('game-mode-emojiword', 'minigame_icons/emoji_word_match.jpeg');
        this.load.image('game-mode-directions', 'minigame_icons/left_right.jpeg');
        this.load.image('game-mode-numbers', 'minigame_icons/number_listening.jpeg');
        this.load.image('game-mode-lettermatch', 'minigame_icons/letter_drag_match.jpeg');
        this.load.image('game-mode-speech', 'minigame_icons/speech_recognition.jpeg');
        this.load.image('game-mode-spelling', 'minigame_icons/word_spelling.jpeg');
    }

    loadPokemonImages() {
        // Load all Pokemon images using POKEMON_DATA
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
        // Load Pokemon name audio for all Pokemon
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

    loadNumberAudio() {
        // Load number audio for numbers 10-99
        for (let num = 10; num < 100; num++) {
            const audioKey = `number_audio_${num}`;
            const audioFilename = `${num}.mp3`;
            this.load.audio(audioKey, `number_audio/${audioFilename}`);
        }
    }

    loadWordAudio() {
        // Load word audio for spelling game
        const words = getAllWords();
        console.log(`Loading ${words.length} word audio files...`);
        words.forEach(wordObj => {
            const audioKey = `word_audio_${wordObj.word}`;
            const audioFilename = `${wordObj.word}.mp3`;
            this.load.audio(audioKey, `word_audio/${audioFilename}`);
        });
        console.log('Word audio loading queued');
    }

    create() {
        // Generate dice face textures
        this.generateDiceFaces();

        // Store game data globally
        this.registry.set('caughtPokemon', this.loadCaughtPokemon());

        // Start the appropriate scene based on URL routing
        const startScene = this.registry.get('startScene') || 'MainGameScene';
        this.scene.start(startScene);
    }

    generateDiceFaces() {
        // Create 8 dice faces with different colored dots representing each game mode
        const colors = [0xFF6B6B, 0x4ECDC4, 0xFFE66D, 0x95E1D3, 0xA78BFA, 0xFF8C42, 0x26A69A, 0xFFC107]; // Red, Cyan, Yellow, Mint, Purple, Orange, Teal, Amber
        const dotPatterns = [
            [{ x: 0.5, y: 0.5 }], // 1 dot (center)
            [{ x: 0.3, y: 0.3 }, { x: 0.7, y: 0.7 }], // 2 dots (diagonal)
            [{ x: 0.3, y: 0.3 }, { x: 0.5, y: 0.5 }, { x: 0.7, y: 0.7 }], // 3 dots
            [{ x: 0.3, y: 0.3 }, { x: 0.7, y: 0.3 }, { x: 0.3, y: 0.7 }, { x: 0.7, y: 0.7 }], // 4 dots
            [{ x: 0.3, y: 0.3 }, { x: 0.7, y: 0.3 }, { x: 0.5, y: 0.5 }, { x: 0.3, y: 0.7 }, { x: 0.7, y: 0.7 }], // 5 dots
            [{ x: 0.3, y: 0.3 }, { x: 0.7, y: 0.3 }, { x: 0.3, y: 0.5 }, { x: 0.7, y: 0.5 }, { x: 0.3, y: 0.7 }, { x: 0.7, y: 0.7 }], // 6 dots
            [{ x: 0.2, y: 0.2 }, { x: 0.5, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.5, y: 0.5 }, { x: 0.2, y: 0.8 }, { x: 0.5, y: 0.8 }, { x: 0.8, y: 0.8 }], // 7 dots
            [{ x: 0.3, y: 0.3 }, { x: 0.7, y: 0.3 }, { x: 0.3, y: 0.5 }, { x: 0.7, y: 0.5 }, { x: 0.3, y: 0.7 }, { x: 0.7, y: 0.7 }, { x: 0.5, y: 0.2 }, { x: 0.5, y: 0.8 }] // 8 dots
        ];

        for (let i = 0; i < 8; i++) {
            const graphics = this.add.graphics();

            // Draw white rounded rectangle background
            graphics.fillStyle(0xFFFFFF, 1);
            graphics.fillRoundedRect(0, 0, 100, 100, 10);

            // Draw border
            graphics.lineStyle(4, 0x000000, 1);
            graphics.strokeRoundedRect(0, 0, 100, 100, 10);

            // Draw dots
            graphics.fillStyle(colors[i], 1);
            dotPatterns[i].forEach(dot => {
                const x = dot.x * 100;
                const y = dot.y * 100;
                graphics.fillCircle(x, y, 12);

                // Border on dots
                graphics.lineStyle(2, 0x000000, 1);
                graphics.strokeCircle(x, y, 12);
            });

            // Generate texture
            graphics.generateTexture(`dice-face-${i + 1}`, 100, 100);
            graphics.destroy();
        }
    }

    loadCaughtPokemon() {
        const saved = localStorage.getItem('pokemonCaughtList');
        return saved ? JSON.parse(saved) : [];
    }
}
