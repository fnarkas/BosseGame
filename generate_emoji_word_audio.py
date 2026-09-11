#!/usr/bin/env python3
"""
Generate audio for every word in the emoji-word dictionary that has no mp3 yet.

The word-picture games (Word-Emoji, Emoji-Word, Första bokstaven) say the
correct word aloud after a wrong answer. That only works for words that have
public/word_audio/<word>.mp3, and the dictionary in src/emojiWordDictionary.js
has more words than the vocabulary lists that fed the other generators.

Uses the same voice as the letters, numbers and spelling words, and trims the
Edge-TTS leading/trailing silence so clips can be stitched.

    pip install edge-tts      (ffmpeg must be on PATH)
    python3 generate_emoji_word_audio.py
"""
import asyncio
import os
import re
import subprocess
from pathlib import Path

import edge_tts

VOICE = "sv-SE-MattiasNeural"
DICTIONARY = Path("src/emojiWordDictionary.js")
OUTPUT_DIR = Path("public/word_audio")


def dictionary_words():
    source = DICTIONARY.read_text(encoding="utf-8")
    return sorted({w.lower() for w in re.findall(r'word:\s*"([^"]+)"', source)})


def trim(path: Path):
    temp = path.with_suffix(".tmp.mp3")
    subprocess.run([
        "ffmpeg", "-i", str(path),
        "-af", "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05:"
               "stop_periods=-1:stop_threshold=-50dB:stop_silence=0.05",
        "-y", str(temp)
    ], capture_output=True, check=True)
    os.replace(temp, path)


async def generate(word: str, path: Path):
    await edge_tts.Communicate(word, VOICE).save(str(path))
    trim(path)


async def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    todo = [w for w in dictionary_words() if not (OUTPUT_DIR / f"{w}.mp3").exists()]
    if not todo:
        print("All dictionary words already have audio.")
        return
    print(f"Generating {len(todo)} file(s) with {VOICE}: {', '.join(todo)}")
    for word in todo:
        path = OUTPUT_DIR / f"{word}.mp3"
        try:
            await generate(word, path)
            print(f"  ✓ {word}.mp3")
        except Exception as error:  # noqa: BLE001
            if path.exists():
                path.unlink()
            print(f"  ✗ {word}: {error}")


if __name__ == "__main__":
    asyncio.run(main())
