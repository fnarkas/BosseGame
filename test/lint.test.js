import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Static checks for patterns that work in the test fake but break in Phaser.
const SRC = path.resolve(__dirname, '../src');
function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p, out);
        else if (p.endsWith('.js') && !p.endsWith('pokemonData.js')) out.push(p);
    }
    return out;
}
const files = walk(SRC);
const rel = (p) => path.relative(SRC, p);

describe('source lint', () => {
    it('never reads a `.destroyed` flag on game objects (Phaser has none; check `.scene` instead)', () => {
        const hits = [];
        for (const file of files) {
            fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
                if (/\.destroyed\b/.test(line) && !line.trim().startsWith('//')) hits.push(`${rel(file)}:${i + 1}`);
            });
        }
        expect(hits).toEqual([]);
    });

    it('pokeball game modes schedule timers/tweens/rewards through the base helpers only', () => {
        const dir = path.join(SRC, 'pokeballGameModes');
        const hits = [];
        for (const name of fs.readdirSync(dir)) {
            if (!name.endsWith('Mode.js') || name === 'BasePokeballGameMode.js') continue;
            fs.readFileSync(path.join(dir, name), 'utf8').split('\n').forEach((line, i) => {
                if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
                if (/scene\.time\.delayedCall\(|scene\.tweens\.add\(|this\.answerCallback\(/.test(line)) {
                    hits.push(`pokeballGameModes/${name}:${i + 1}`);
                }
            });
        }
        expect(hits).toEqual([]);
    });

    it('every pokeball game mode cleanup() calls super.cleanup()', () => {
        const dir = path.join(SRC, 'pokeballGameModes');
        const missing = [];
        for (const name of fs.readdirSync(dir)) {
            if (!name.endsWith('Mode.js') || name === 'BasePokeballGameMode.js') continue;
            const src = fs.readFileSync(path.join(dir, name), 'utf8');
            if (/^\s*cleanup\s*\(/m.test(src) && !/super\.cleanup\(/.test(src)) missing.push(name);
        }
        expect(missing).toEqual([]);
    });
});

describe('shared-module conventions', () => {
    const codeLines = (file) => fs.readFileSync(file, 'utf8').split('\n')
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => !line.trim().startsWith('//') && !line.trim().startsWith('*'));

    it('only storage.js touches localStorage', () => {
        const hits = [];
        for (const file of files) {
            if (['storage.js', 'utils/clearStorage.js'].includes(rel(file))) continue;
            for (const { line, n } of codeLines(file)) {
                if (/\blocalStorage\./.test(line)) hits.push(`${rel(file)}:${n}`);
            }
        }
        expect(hits).toEqual([]);
    });

    it('only minigameConfig.js fetches the minigame config', () => {
        const hits = [];
        for (const file of files) {
            if (rel(file) === 'minigameConfig.js') continue;
            for (const { line, n } of codeLines(file)) {
                if (/fetch\(\s*['"`]\/?config\/minigames\.json/.test(line)) hits.push(`${rel(file)}:${n}`);
            }
        }
        expect(hits).toEqual([]);
    });

    it('game modes play audio through the base helpers (never scene.sound.play/add)', () => {
        const dir = path.join(SRC, 'pokeballGameModes');
        const hits = [];
        for (const name of fs.readdirSync(dir)) {
            if (!name.endsWith('.js') || name === 'BasePokeballGameMode.js') continue;
            for (const { line, n } of codeLines(path.join(dir, name))) {
                if (/scene\.sound\.(play|add)\(/.test(line)) hits.push(`pokeballGameModes/${name}:${n}`);
            }
        }
        expect(hits).toEqual([]);
    });

    it('game modes never duplicate the shared progress/particle/dashed-rect helpers', () => {
        const dir = path.join(SRC, 'pokeballGameModes');
        const hits = [];
        for (const name of fs.readdirSync(dir)) {
            if (!name.endsWith('.js') || ['BasePokeballGameMode.js', 'uiKit.js'].includes(name) || name.endsWith('Base.js')) continue;
            const src = fs.readFileSync(path.join(dir, name), 'utf8');
            for (const method of ['createBallIndicators', 'updateBallIndicators', 'drawDashedRect', 'parseNumberRange']) {
                // A method definition: `    name(args) {` — call sites end in `;`
                if (new RegExp(`^\\s{4}${method}\\s*\\([^)]*\\)\\s*\\{`, 'm').test(src)) hits.push(`pokeballGameModes/${name}: ${method}()`);
            }
        }
        expect(hits).toEqual([]);
    });
});

describe('no instructional text for the non-reading player', () => {
    // Known status/instruction strings that used to be drawn on screen. The
    // child cannot read them; state must be shown with icons and audio.
    const BANNED = ['Väntar på', 'Lyssnar', 'Tryck för', 'Tryck på', 'Försök igen', 'Du sa', 'Mikrofon', 'Läs ordet', 'CONTINUE', 'Cleared:', 'Tillbaka'];
    it('modes and scenes never draw the old status/instruction strings', () => {
        const hits = [];
        for (const file of files) {
            const r = rel(file);
            if (!r.startsWith('pokeballGameModes/') && !r.startsWith('scenes/') && !r.startsWith('components/')) continue;
            fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
                if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
                if (BANNED.some(b => line.includes(`'${b}`) || line.includes(`\`${b}`) || line.includes(`"${b}`))) hits.push(`${r}:${i + 1}`);
            });
        }
        expect(hits).toEqual([]);
    });
});
