import { describe, it, expect, beforeEach } from 'vitest';
import { FakeScene, startMode, flush } from '../helpers/fakeScene.js';
import { WordEmojiMatchMode } from '../../src/pokeballGameModes/WordEmojiMatchMode.js';
import { EmojiWordMatchMode } from '../../src/pokeballGameModes/EmojiWordMatchMode.js';
import { setLetterFilterEnabled, DEFAULT_EMOJI_WORD_DICTIONARY } from '../../src/emojiWordDictionary.js';
import { incrementStreak, getStreak } from '../../src/streak.js';

const variants = [
    {
        name: 'WordEmojiMatchMode', Mode: WordEmojiMatchMode, dataKey: 'emoji',
        correct: (m) => m.challengeData.correctEmoji, choices: (m) => m.challengeData.emojis,
        id: (m) => m.challengeData.word
    },
    {
        name: 'EmojiWordMatchMode', Mode: EmojiWordMatchMode, dataKey: 'word',
        correct: (m) => m.challengeData.correctWord, choices: (m) => m.challengeData.words,
        id: (m) => m.challengeData.correctWord
    }
];

for (const v of variants) {
    describe(v.name, () => {
        let scene, mode, calls;
        const buttons = () => scene.interactives().filter(o => o.type === 'Rectangle' && o.getData(v.dataKey));
        const correctBtn = () => buttons().find(b => b.getData(v.dataKey) === v.correct(mode));
        const wrongBtn = () => buttons().find(b => b.getData(v.dataKey) !== v.correct(mode));

        beforeEach(async () => {
            scene = new FakeScene();
            mode = new v.Mode();
            calls = [];
            mode.setAnswerCallback((ok, answer, x, y) => calls.push({ ok, answer }));
            await startMode(mode, scene);
        });

        it('shows five distinct choices including the correct one', () => {
            const choices = v.choices(mode);
            expect(choices).toHaveLength(5);
            expect(new Set(choices).size).toBe(5);
            expect(choices).toContain(v.correct(mode));
            expect(buttons()).toHaveLength(5);
        });

        it('rewards a correct tap exactly once', () => {
            scene.click(correctBtn());
            scene.click(correctBtn());
            expect(calls).toEqual([{ ok: true, answer: v.correct(mode) }]);
        });

        it('reveals the answer after a wrong tap, resets the streak and moves on', async () => {
            incrementStreak();
            const first = v.id(mode);
            scene.click(wrongBtn());
            scene.advance(100);
            // Taps during the shake/reveal do nothing
            scene.click(correctBtn());
            expect(calls).toHaveLength(0);
            scene.advance(5000);
            await flush();
            expect(getStreak()).toBe(0);
            expect(calls).toHaveLength(0);
            expect(buttons()).toHaveLength(5);
            expect(v.id(mode)).not.toBe(first);
        });

        it('cleans up without leaving orphaned UI or late callbacks', async () => {
            scene.click(wrongBtn());
            scene.advance(100);
            mode.cleanup(scene);
            const t = scene.time.now;
            scene.advance(10000);
            await flush();
            expect(scene.objectsCreatedAfter(t)).toEqual([]);
            expect(scene.liveObjects()).toEqual([]);
            expect(calls).toHaveLength(0);
        });

        it('never offers a distractor that is also a right answer for the shown emoji', () => {
            const emojiOf = (word) => DEFAULT_EMOJI_WORD_DICTIONARY.find(d => d.word === word).emoji;
            for (let i = 0; i < 200; i++) {
                mode.generateChallenge();
                const choices = v.choices(mode);
                expect(new Set(choices).size).toBe(choices.length);
                const correctEmoji = mode.challengeData.correctEmoji || emojiOf(mode.challengeData.correctWord);
                const emojis = v.dataKey === 'emoji' ? choices : choices.map(emojiOf);
                expect(emojis.filter(e => e === correctEmoji)).toHaveLength(1);
            }
        });

        it('works with the letter filter enabled', async () => {
            setLetterFilterEnabled(true);
            const s2 = new FakeScene();
            const m2 = new v.Mode();
            m2.setAnswerCallback(() => {});
            for (let i = 0; i < 30; i++) {
                await startMode(m2, s2);
                const choices = v.choices(m2);
                expect(new Set(choices).size).toBe(choices.length);
                expect(choices).toContain(v.correct(m2));
                m2.cleanup(s2);
            }
        });
    });
}
