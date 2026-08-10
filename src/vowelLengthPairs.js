// Minimal pairs for the vowel-length minigame.
//
// Swedish has complementary quantity: in a stressed syllable either the vowel is
// long and the following consonant short (tak = [ta:k]), or the vowel is short
// and the consonant long (tack = [tak:]). The doubled consonant in writing is
// what marks which one it is. Each pair below differs ONLY in that doubling, so
// the two words sound different in exactly one way.
//
// Hand-curated, not generated: both members must be real words a child can make
// sense of, and the pairs are spread across the vowels. Edit freely, then run
// generate_vowel_audio.py to produce audio for any new words.

export const VOWEL_PAIRS = [
    // a
    { long: 'glas', short: 'glass' },   // glas att dricka ur / glass att äta
    { long: 'tak',  short: 'tack'  },
    { long: 'mat',  short: 'matt'  },
    { long: 'hat',  short: 'hatt'  },
    { long: 'kal',  short: 'kall'  },
    { long: 'lam',  short: 'lamm'  },
    { long: 'dam',  short: 'damm'  },
    { long: 'vas',  short: 'vass'  },
    { long: 'tal',  short: 'tall'  },
    { long: 'hal',  short: 'hall'  },
    { long: 'val',  short: 'vall'  },   // val = valen i havet
    { long: 'bak',  short: 'back'  },
    { long: 'van',  short: 'vann'  },
    // i
    { long: 'vit',  short: 'vitt'  },
    { long: 'vila', short: 'villa' },
    { long: 'sil',  short: 'sill'  },
    { long: 'fina', short: 'finna' },
    // o
    { long: 'bok',  short: 'bock'  },
    { long: 'kola', short: 'kolla' },
    { long: 'rot',  short: 'rott'  },
    // u
    { long: 'ful',  short: 'full'  },
    { long: 'sur',  short: 'surr'  },
    // e
    { long: 'fet',  short: 'fett'  },
    { long: 'het',  short: 'hett'  },
    // ä
    { long: 'nät',  short: 'nätt'  },
    // ö
    { long: 'söt',  short: 'sött'  },
    { long: 'lös',  short: 'löss'  }
];

// Every word in the list, both members of every pair.
export function getAllVowelWords() {
    return VOWEL_PAIRS.flatMap(pair => [pair.long, pair.short]);
}

// The first vowel of a word — the one whose length the pair is about.
export function firstVowelOf(word) {
    const match = word.toLowerCase().match(/[aeiouyåäö]/);
    return match ? match[0] : null;
}
