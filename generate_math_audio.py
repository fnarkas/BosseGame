#!/usr/bin/env python3
"""
Generate Swedish TTS audio for math words using edge-tts
Output: public/math_audio/{filename}.mp3

These are stitched between number audio at runtime, e.g. "tre" + "gånger" + "tio".
Run trim_math_audio() afterwards - Edge-TTS pads ~240ms of silence at the start
and ~930ms at the end, which ruins the stitching.
"""

import asyncio
import edge_tts
import os
import subprocess

# Same Swedish voice as the number audio, so the stitched phrase sounds like one speaker
VOICE = "sv-SE-MattiasNeural"

OUTPUT_DIR = "public/math_audio"

# filename (ASCII, used as the audio key suffix) -> spoken text
WORDS = {
    "ganger": "gånger",
}


async def generate_word_audio(filename, text):
    """Generate TTS audio for a single word"""
    filepath = f"{OUTPUT_DIR}/{filename}.mp3"

    try:
        print(f"Generating '{text}'...", end=" ")
        tts = edge_tts.Communicate(text, VOICE)
        await tts.save(filepath)
        print(f"✓ Saved {filepath}")
        return True
    except Exception as e:
        print(f"✗ Error: {e}")
        return False


def trim_audio_file(filepath):
    """Trim leading/trailing silence so the stitched phrase flows"""
    temp_file = filepath + ".trimmed.mp3"
    cmd = [
        'ffmpeg',
        '-i', filepath,
        '-af', 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05:'
               'stop_periods=-1:stop_threshold=-50dB:stop_silence=0.05',
        '-y',
        temp_file
    ]

    try:
        subprocess.run(cmd, capture_output=True, check=True)
        os.replace(temp_file, filepath)
        print(f"✓ Trimmed {filepath}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"✗ Failed to trim {filepath}: {e}")
        if os.path.exists(temp_file):
            os.remove(temp_file)
        return False


async def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print(f"Generating Swedish TTS audio for {len(WORDS)} math word(s)...")
    print(f"Voice: {VOICE}")
    print(f"Output: {OUTPUT_DIR}/\n")

    for filename, text in WORDS.items():
        if await generate_word_audio(filename, text):
            trim_audio_file(f"{OUTPUT_DIR}/{filename}.mp3")

    print("\n✓ Done")


if __name__ == "__main__":
    asyncio.run(main())
