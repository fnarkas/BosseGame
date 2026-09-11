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

        it('reveals and speaks the answer after a wrong tap, resets the streak and re-asks the word', async () => {
            incrementStreak();
            const first = v.id(mode);
            const firstId = mode.challengeData.id;
            const audioKey = `word_audio_${mode.challengeData.word ? mode.challengeData.word.toLowerCase() : mode.challengeData.correctWord.toLowerCase()}`;
            scene.addFakeAudio(audioKey);
            const wrong = wrongBtn();
            const wrongX = wrong.x;
            scene.click(wrong);
            scene.advance(100);
            // Taps during the shake/reveal do nothing
            scene.click(correctBtn());
            expect(calls).toHaveLength(0);
            scene.advance(350); // shake over: gold reveal + the word spoken
            expect(wrong.x).toBe(wrongX);
            expect(scene.lastAudio()).toBe(audioKey);
            const revealed = (mode.emojiButtons || mode.wordButtons).find(b => b[v.dataKey] === v.correct(mode));
            expect(revealed.button.fillColor).toBe(0xFFD700);
            expect(revealed.button.input.enabled).toBe(false);
            scene.advance(5000);
            await flush();
            expect(getStreak()).toBe(0);
            expect(calls).toHaveLength(0);
            expect(buttons()).toHaveLength(5);
            // The missed word comes straight back...
            expect(v.id(mode)).toBe(first);
            expect(mode.challengeData.id).toBe(firstId);
            // ...then one other word, then the missed one once more
            mode.generateChallenge();
            expect(mode.challengeData.id).not.toBe(firstId);
            mode.generateChallenge();
            expect(mode.challengeData.id).toBe(firstId);
        });

        it(v.dataKey === 'word' ? 'has a speaker that says the target word' : 'has no speaker before the answer', () => {
            const speaker = scene.findText('🔊');
            if (v.dataKey === 'word') {
                const key = `word_audio_${mode.challengeData.correctWord.toLowerCase()}`;
                scene.addFakeAudio(key);
                expect(speaker).not.toBeNull();
                expect(scene.playedAudio()).toEqual([]); // the emoji is the prompt; nothing auto-plays
                scene.click(speaker);
                expect(scene.playedAudio()).toEqual([key]);
            } else {
                expect(speaker).toBeNull();
            }
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
