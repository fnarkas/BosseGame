// Hard-to-spell letter groups in Swedish words.
//
// A beginner spells by sound. That works for "hund" but not for the parts of
// Swedish spelling where the sound and the letters disagree:
//
//   sj-sound   written sj, skj, stj, sch, or sk before a soft vowel (skepp)
//   tj-sound   written tj, kj, or k before a soft vowel at the start (kille)
//   j-sound    written g before a soft vowel at the start (gör, ge), or hj/lj/dj/gj
//   k-sound    written ck after a short vowel (tack)
//   ng-sound   written ng (or gn in regn), two letters for one sound
//   x          one letter for two sounds (sex)
//
// With the "prefill hard letters" setting on, the spelling game fills these
// groups in for the child so the rest of the word can be sounded out. The
// admin panel can edit the list; `markHardParts()` shows what a list does to
// every word in the pool.
//
// Rule syntax (comma separated in the config):
//   ck        the letters "ck" anywhere in the word
//   sk*       "sk" only when followed by a soft vowel (e i y ä ö)
//   ^k*       "k" at the start of the word, only before a soft vowel
//   ^hj       "hj" only at the start of the word
//   dubbel    the second letter of any double consonant (boll, katt)

export const SOFT_VOWELS = 'eiyäö';
const CONSONANTS = 'bcdfghjklmnpqrstvwxz';

export const DEFAULT_HARD_CLUSTERS = [
    'stj', 'skj', 'sch', 'sj', 'sk*',
    'tj', 'kj', '^k*',
    '^g*', '^hj', '^lj', '^dj', '^gj',
    'ck', 'ng', 'gn', 'x'
];

export function parseClusterRules(text) {
    const source = Array.isArray(text) ? text : String(text ?? '').split(',');
    const rules = [];
    for (const raw of source) {
        let token = raw.trim().toLowerCase();
        if (!token) continue;
        if (token === 'dubbel' || token === 'double') {
            rules.push({ kind: 'double', letters: '', atStart: false, softVowel: false });
            continue;
        }
        const atStart = token.startsWith('^');
        if (atStart) token = token.slice(1);
        const softVowel = token.endsWith('*');
        if (softVowel) token = token.slice(0, -1);
        if (!/^[a-zåäö]+$/.test(token)) continue;
        rules.push({ kind: 'cluster', letters: token, atStart, softVowel });
    }
    // Longest first so "stj" wins over "tj" and "sj"
    rules.sort((a, b) => b.letters.length - a.letters.length);
    return rules;
}

// Non-overlapping spans [{ start, end, rule }] (end exclusive) of hard parts
// in `word`, scanning left to right and preferring longer rules.
export function findHardSpans(word, rules = DEFAULT_HARD_CLUSTERS) {
    const parsed = Array.isArray(rules) && rules.length && typeof rules[0] === 'object' ? rules : parseClusterRules(rules);
    const w = String(word).toLowerCase();
    const spans = [];
    const taken = new Array(w.length).fill(false);

    const claim = (start, end, label) => {
        for (let i = start; i < end; i++) if (taken[i]) return false;
        for (let i = start; i < end; i++) taken[i] = true;
        spans.push({ start, end, rule: label });
        return true;
    };

    for (const rule of parsed) {
        if (rule.kind === 'double') {
            for (let i = 1; i < w.length; i++) {
                if (w[i] === w[i - 1] && CONSONANTS.includes(w[i])) claim(i, i + 1, 'dubbel');
            }
            continue;
        }
        const { letters, atStart, softVowel } = rule;
        let from = 0;
        while (from <= w.length - letters.length) {
            const idx = w.indexOf(letters, from);
            if (idx < 0) break;
            from = idx + 1;
            if (atStart && idx !== 0) continue;
            const next = w[idx + letters.length];
            if (softVowel && !(next && SOFT_VOWELS.includes(next))) continue;
            claim(idx, idx + letters.length, letters + (softVowel ? '*' : ''));
        }
    }
    return spans.sort((a, b) => a.start - b.start);
}

// Indices of the letters a hard rule covers.
export function hardIndices(word, rules = DEFAULT_HARD_CLUSTERS) {
    const set = new Set();
    for (const { start, end } of findHardSpans(word, rules)) {
        for (let i = start; i < end; i++) set.add(i);
    }
    return set;
}

// "många" -> "må[ng]a": the word with its hard parts bracketed, for review.
export function markHardParts(word, rules = DEFAULT_HARD_CLUSTERS) {
    const spans = findHardSpans(word, rules);
    if (spans.length === 0) return String(word);
    let out = '';
    let pos = 0;
    for (const { start, end } of spans) {
        out += word.slice(pos, start) + '[' + word.slice(start, end) + ']';
        pos = end;
    }
    return out + word.slice(pos);
}
