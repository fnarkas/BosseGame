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
