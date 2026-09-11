import { VowelModeBase, wordKey, vowelKey } from './VowelModeBase.js';
import { VOWEL_PAIRS, firstVowelOf } from '../vowelLengthPairs.js';
import { loadModeConfig } from '../minigameConfig.js';

/**
 * Vowel length game mode
 *
 * Swedish has complementary quantity: in a stressed syllable either the vowel is
 * long and the following consonant short (tak = [ta:k]) or the vowel is short and
 * the consonant long (tack = [tak:]). The doubled consonant in writing is what
 * marks which one it is. This mode drills that with minimal pairs, from three
 * angles on the SAME pair within one round:
 *
 *   0. Hear the word, pick the written form.       glas / glass
 *   1. See the word, hear one reading, judge it.   ✅ / ❌
 *   2. Hear the word, pick one or two consonants.  s / ss
 *
 * On every answer the word is spelled out and the vowel visibly stretches (long)
 * or snaps together (short), so the rule is shown rather than told. A missed
 * question is asked again straight away, and once more a little later.
 */

const ROUND_PICK_SPELLING = 0;
const ROUND_JUDGE_READING = 1;
const ROUND_PICK_CONSONANTS = 2;
const ROUND_COUNT = 3;

// Split a minimal pair at the vowel, into the parts it is built from:
//   vila / villa -> { stem: 'vi',  longCluster: 'l', shortCluster: 'll', tail: 'a' }
//   tak  / tack  -> { stem: 'ta',  longCluster: 'k', shortCluster: 'ck', tail: ''  }
// long = stem + longCluster + tail, short = stem + shortCluster + tail.
//
// Splitting at the vowel rather than at the first differing character matters:
// Swedish writes a long /k/ as "ck", not "kk", so tack and bock are not simple
// letter doublings, and a naive prefix comparison mis-splits them.
const VOWEL_RE = /[aeiouyåäö]/;

export function splitPair(long, short) {
    const v = long.search(VOWEL_RE);
    const clusterAfterVowel = (word) => {
        const rest = word.slice(v + 1);
        const match = rest.match(/^[^aeiouyåäö]+/);
        return match ? match[0] : '';
    };

    const longCluster = clusterAfterVowel(long);
    return {
        stem: long.slice(0, v + 1),
        longCluster,
        shortCluster: clusterAfterVowel(short),
        tail: long.slice(v + 1 + longCluster.length)
    };
}

export class VowelLengthMode extends VowelModeBase {
    constructor() {
        super({ modeName: 'VowelLengthMode', requiredCorrect: 3, optionHeight: 150 });
        this.currentPair = null;
        this.roundType = ROUND_PICK_SPELLING;
    }

    async loadConfig() {
        const config = await loadModeConfig('vowelLength', { required: 3, showListenHelp: true });
        this.requiredCorrect = config.required || this.requiredCorrect;
        this.showListenHelp = config.showListenHelp;
        this.configLoaded = true;
        console.log('VowelLengthMode loaded with settings:', {
            required: this.requiredCorrect,
            showListenHelp: this.showListenHelp,
            pairs: VOWEL_PAIRS.length
        });
    }

    generateChallenge() {
        // A missed question comes back exactly as it was asked.
        const retry = this.takeRetry();

        // One pair carries the whole round, seen from all three angles.
        if (retry) {
            this.currentPair = retry.pair;
        } else if (this.correctCount === 0 || !this.currentPair) {
            this.currentPair = VOWEL_PAIRS[Phaser.Math.Between(0, VOWEL_PAIRS.length - 1)];
        }
        this.roundType = this.correctCount % ROUND_COUNT;

        const pair = this.currentPair;
        const targetIsLong = retry ? retry.targetIsLong : Phaser.Math.Between(0, 1) === 0;
        const target = targetIsLong ? pair.long : pair.short;
        const parts = splitPair(pair.long, pair.short);

        this.challengeData = {
            pair,
            parts,
            target,
            targetIsLong,
            // Round 1 plays one reading at random; the answer is whether it matched.
            playedIsLong: retry ? retry.playedIsLong : Phaser.Math.Between(0, 1) === 0
        };

        return this.challengeData;
    }

    createChallengeUI(scene) {
        this.inputLocked = false;
        this.isRevealing = false;
        const { target, parts, playedIsLong } = this.challengeData;

        if (this.roundType === ROUND_PICK_SPELLING) {
            this.createSpeaker(scene, () => this.playWord(scene, target));
            this.createWordOptions(scene);
            this.delayedCall(scene, 300, () => this.playWord(scene, target));

        } else if (this.roundType === ROUND_JUDGE_READING) {
            // The written word is the stimulus; one reading of it is played.
            const played = playedIsLong ? this.challengeData.pair.long : this.challengeData.pair.short;
            this.createSpeaker(scene, () => this.playWord(scene, played));
            this.renderWord(scene, target);
            this.createJudgeOptions(scene);
            this.delayedCall(scene, 300, () => this.playWord(scene, played));

        } else {
            this.createSpeaker(scene, () => this.playWord(scene, target));
            this.renderWord(scene, `${parts.stem}${parts.tail}`, { gapAfter: parts.stem.length - 1 });
            this.createConsonantOptions(scene);
            this.delayedCall(scene, 300, () => this.playWord(scene, target));
        }

        this.createBallIndicators(scene);
    }

    // ---------------- Answer options ----------------

    createWordOptions(scene) {
        const { pair, target } = this.challengeData;
        const vowel = firstVowelOf(pair.long);
        // Long form on the left, short on the right - a stable place for each.
        [pair.long, pair.short].forEach((word, index) => {
            const isLongForm = index === 0;
            this.createTextCard(scene, index, word.toUpperCase(), {
                fontSize: '58px',
                onSelect: () => this.handleAnswer(scene, word === target, word, index),
                onListen: () => this.playVowel(scene, vowel, isLongForm)
            });
        });
    }

    createJudgeOptions(scene) {
        const { targetIsLong, playedIsLong } = this.challengeData;
        const matched = targetIsLong === playedIsLong;
        ['✅', '❌'].forEach((label, index) => {
            const saysMatched = index === 0;
            this.createTextCard(scene, index, label, {
                fontSize: '72px',
                onSelect: () => this.handleAnswer(scene, saysMatched === matched, label, index)
            });
        });
    }

    createConsonantOptions(scene) {
        const { parts, targetIsLong, pair } = this.challengeData;
        const vowel = firstVowelOf(pair.long);
        [parts.longCluster, parts.shortCluster].forEach((cluster, index) => {
            const isLongForm = index === 0;
            this.createTextCard(scene, index, cluster.toUpperCase(), {
                fontSize: '64px',
                onSelect: () => this.handleAnswer(scene, isLongForm === targetIsLong, cluster, index),
                onListen: () => this.playVowel(scene, vowel, isLongForm)
            });
        });
    }

    // ---------------- Hooks ----------------

    mistakeLabel() {
        return this.challengeData.target;
    }

    retryItem() {
        const { pair, targetIsLong, playedIsLong } = this.challengeData;
        return { pair, targetIsLong, playedIsLong };
    }

    // Spell out the correct word and show what the vowel does. After a miss the
    // isolated vowel is played after the word, so the child hears the length
    // on its own as well as inside the word.
    reveal(scene, onDone) {
        const { target, targetIsLong } = this.challengeData;
        const vowel = firstVowelOf(target);

        this.disableCards();
        // The answer is settled, so free listening is safe from here on. While a
        // question is open, a tappable vowel would simply announce the answer.
        this.renderWord(scene, target, {
            interactiveVowel: true,
            onVowelTap: () => this.playVowel(scene, vowel, targetIsLong)
        });

        if (this.hasError) {
            this.playSequence(scene, [wordKey(target), vowelKey(vowel, targetIsLong)]);
        } else {
            this.playWord(scene, target);
        }

        const animated = this.animateVowelLength(scene, targetIsLong, { squeezeTo: 0.75 });
        this.delayedCall(scene, animated ? 1100 : 600, onDone);
    }

    checkAnswer(answer) {
        return answer === this.challengeData.target;
    }
}
