#!/usr/bin/env python3
"""
Audio for the vowel-length minigame.

Two kinds of clips:

  1. The words themselves, both members of every minimal pair, read from
     src/vowelLengthPairs.js so the list and the audio can never drift apart.
     -> public/word_audio/<word>.mp3   (the existing shared word audio dir)

  2. Isolated vowel sounds, long and short, for a e i o u y a a o.
     -> public/vowel_audio/<vowel>_long.mp3 and <vowel>_short.mp3

The long vowels are easy: a Swedish vowel's LETTER NAME is its long sound, so
feeding the bare letter to the TTS gives exactly what we want.

The short vowels are the hard part, because a short Swedish vowel cannot stand
alone - it only exists in a syllable closed by a consonant. So we synthesise a
closed syllable ("att", "ett", ...) and cut the consonant tail off. Speeding up
the long clip would NOT work: long and short Swedish vowels differ in quality,
not just duration ([a:] vs [a], [u:] vs [O]).

Usage:
    python3 generate_vowel_audio.py --test    # 3 pairs + 2 vowels, for listening
    python3 generate_vowel_audio.py           # everything missing
    python3 generate_vowel_audio.py --force   # regenerate everything
"""

import asyncio
import os
import re
import subprocess
import sys

import edge_tts

# Same voice as the word, letter, number and math audio
VOICE = "sv-SE-MattiasNeural"

SOURCE_JS = "src/vowelLengthPairs.js"
WORD_AUDIO_DIR = "public/word_audio"
VOWEL_AUDIO_DIR = "public/vowel_audio"

# Vowel -> a real Swedish word that STARTS with that vowel, short and closed by a
# consonant. Real words because the TTS reads invented syllables unreliably
# ("itt" came out at 0.96s, three times too long). Word-initial because the vowel
# is then at a known place - the very front - so keeping the first slice of the
# clip reliably keeps the vowel and nothing else. See trim_to_vowel().
#
# Note two genuine coincidences, not bugs: short e and short ä are both [ɛ], and
# short o and short å are both [ɔ]. Those pairs will sound identical, correctly.
SHORT_VOWEL_FRAMES = {
    'a': 'att',
    'e': 'ett',
    'i': 'inte',
    'o': 'olja',
    'u': 'under',
    'y': 'yttre',
    'å': 'åtta',
    'ä': 'äpple',
    'ö': 'öppna',
}

# A short Swedish vowel runs roughly 80-120 ms. Keep a little more than that and
# fade, so the following consonant is gone but nothing clicks.
SHORT_VOWEL_KEEP = 0.14
SHORT_VOWEL_FADE = 0.03

VOWELS = list(SHORT_VOWEL_FRAMES.keys())

# A small sample to listen to before committing to the whole set
TEST_PAIRS = [('glas', 'glass'), ('tak', 'tack'), ('vit', 'vitt')]
TEST_VOWELS = ['a', 'i']


def read_pairs():
    """Pull { long: 'x', short: 'y' } out of the hand-written pairs module"""
    with open(SOURCE_JS, encoding='utf-8') as f:
        source = f.read()

    pairs = re.findall(
        r"\{\s*long:\s*'([a-zåäö]+)'\s*,\s*short:\s*'([a-zåäö]+)'\s*\}",
        source
    )
    if not pairs:
        raise SystemExit(f"No pairs found in {SOURCE_JS}")
    return pairs


async def synth(text, filepath):
    """TTS one string to one file"""
    tts = edge_tts.Communicate(text, VOICE)
    await tts.save(filepath)


def trim_silence(filepath):
    """Strip Edge-TTS's ~240ms lead-in and ~930ms tail"""
    temp = filepath + ".trimmed.mp3"
    cmd = [
        'ffmpeg', '-i', filepath,
        '-af', 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05:'
               'stop_periods=-1:stop_threshold=-50dB:stop_silence=0.05',
        '-y', temp
    ]
    try:
        subprocess.run(cmd, capture_output=True, check=True)
        os.replace(temp, filepath)
        return True
    except subprocess.CalledProcessError as e:
        print(f"✗ Failed to trim {filepath}: {e}")
        if os.path.exists(temp):
            os.remove(temp)
        return False


def duration_of(filepath):
    """Length in seconds, via ffprobe"""
    out = subprocess.run(
        ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
         '-of', 'csv=p=0', filepath],
        capture_output=True, text=True, check=True
    )
    return float(out.stdout.strip())


def trim_to_vowel(filepath):
    """
    Keep only the leading vowel of a word like "inte" or "äpple".

    The frame words all begin with the vowel we want, so a fixed short window
    off the front is the whole trick - no guessing at proportions of a clip
    whose length depends on how many syllables the word has.
    """
    keep = min(SHORT_VOWEL_KEEP, duration_of(filepath))
    temp = filepath + ".vowel.mp3"
    cmd = [
        'ffmpeg', '-i', filepath,
        '-t', f'{keep:.3f}',
        '-af', f'afade=t=out:st={max(0, keep - SHORT_VOWEL_FADE):.3f}:d={SHORT_VOWEL_FADE}',
        '-y', temp
    ]
    try:
        subprocess.run(cmd, capture_output=True, check=True)
        os.replace(temp, filepath)
        return True
    except subprocess.CalledProcessError as e:
        print(f"✗ Failed to cut vowel from {filepath}: {e}")
        if os.path.exists(temp):
            os.remove(temp)
        return False


async def generate_words(words, force):
    os.makedirs(WORD_AUDIO_DIR, exist_ok=True)
    todo = [w for w in words
            if force or not os.path.exists(f"{WORD_AUDIO_DIR}/{w}.mp3")]

    skipped = len(words) - len(todo)
    if skipped:
        print(f"Skipping {skipped} word(s) that already have audio")
    if not todo:
        return

    print(f"\nGenerating {len(todo)} word clip(s)...")
    for i, word in enumerate(todo, 1):
        path = f"{WORD_AUDIO_DIR}/{word}.mp3"
        try:
            await synth(word, path)
            trim_silence(path)
            print(f"  [{i}/{len(todo)}] ✓ {word}  ({duration_of(path):.2f}s)")
        except Exception as e:
            print(f"  [{i}/{len(todo)}] ✗ {word}: {e}")


async def generate_vowels(vowels, force):
    os.makedirs(VOWEL_AUDIO_DIR, exist_ok=True)
    print(f"\nGenerating vowel clips for: {', '.join(vowels)}")

    for vowel in vowels:
        # Long: the letter name IS the long vowel sound
        long_path = f"{VOWEL_AUDIO_DIR}/{vowel}_long.mp3"
        if force or not os.path.exists(long_path):
            try:
                await synth(vowel, long_path)
                trim_silence(long_path)
                print(f"  ✓ {vowel}_long   ({duration_of(long_path):.2f}s)")
            except Exception as e:
                print(f"  ✗ {vowel}_long: {e}")

        # Short: closed syllable with the consonant tail cut off
        short_path = f"{VOWEL_AUDIO_DIR}/{vowel}_short.mp3"
        if force or not os.path.exists(short_path):
            frame = SHORT_VOWEL_FRAMES[vowel]
            try:
                await synth(frame, short_path)
                trim_silence(short_path)
                before = duration_of(short_path)
                trim_to_vowel(short_path)
                print(f"  ✓ {vowel}_short  ({before:.2f}s '{frame}' -> "
                      f"{duration_of(short_path):.2f}s)")
            except Exception as e:
                print(f"  ✗ {vowel}_short: {e}")


async def main():
    force = '--force' in sys.argv
    test = '--test' in sys.argv

    pairs = read_pairs()
    print(f"Read {len(pairs)} pairs from {SOURCE_JS}")

    if test:
        words = [w for pair in TEST_PAIRS for w in pair]
        vowels = TEST_VOWELS
        print("TEST RUN — a small sample to listen to before generating the rest\n")
    else:
        words = [w for pair in pairs for w in pair]
        vowels = VOWELS

    await generate_words(words, force)
    await generate_vowels(vowels, force)

    if test:
        print("\nListen to these before going further:")
        for a, b in TEST_PAIRS:
            print(f"  afplay {WORD_AUDIO_DIR}/{a}.mp3 && afplay {WORD_AUDIO_DIR}/{b}.mp3")
        for v in TEST_VOWELS:
            print(f"  afplay {VOWEL_AUDIO_DIR}/{v}_long.mp3 && afplay {VOWEL_AUDIO_DIR}/{v}_short.mp3")

    print("\n✓ Done")


if __name__ == "__main__":
    asyncio.run(main())
