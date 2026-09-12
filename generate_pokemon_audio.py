#!/usr/bin/env python3
"""
Generate English TTS audio for every Pokemon name in src/pokemonData.js using
edge-tts, then trim the leading/trailing silence Edge-TTS adds (~240 ms start,
~930 ms end) so the name can be stitched right after a letter sound.

Output: public/pokemon_audio/{id:03d}_{name}.mp3 (lowercase name, hyphens
removed, matching pokemonAudioAsset() in src/assetManifest.js).

Idempotent: names that already have a file are skipped, and already-trimmed
files are left alone (a second trim pass is a no-op).

Usage:
    python3 generate_pokemon_audio.py            # generate missing, trim all
    python3 generate_pokemon_audio.py --force    # regenerate every file

Requires: pip install edge-tts, and ffmpeg on PATH for trimming.
"""

import argparse
import asyncio
import os
import re
import subprocess
from pathlib import Path

import edge_tts

DATA_FILE = Path("src/pokemonData.js")
OUTPUT_DIR = Path("public/pokemon_audio")
VOICE = "en-US-GuyNeural"  # Clear, neutral American English
CONCURRENCY = 6            # Edge-TTS throttles bursts of hundreds of requests
SILENCE_FILTER = (
    "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05:"
    "stop_periods=-1:stop_threshold=-50dB:stop_silence=0.05"
)


def read_pokemon_names():
    """[(id, name)] straight from the generated data file."""
    text = DATA_FILE.read_text()
    pairs = re.findall(r'id:\s*(\d+),\s*name:\s*"([^"]+)"', text)
    return [(int(pid), name) for pid, name in pairs]


def audio_path(pokemon_id, name):
    return OUTPUT_DIR / f"{pokemon_id:03d}_{name.lower().replace('-', '')}.mp3"


def spoken_text(name):
    # "Mr-mime" -> "Mr mime", "Ho-oh" -> "Ho oh": the hyphen only marks a word break.
    return name.replace('-', ' ')


async def generate_one(semaphore, pokemon_id, name):
    path = audio_path(pokemon_id, name)
    async with semaphore:
        for attempt in range(3):
            try:
                await edge_tts.Communicate(spoken_text(name), VOICE).save(str(path))
                print(f"✓ #{pokemon_id:03d} {name}")
                return True
            except Exception as error:  # noqa: BLE001 - retry any transient failure
                print(f"✗ #{pokemon_id:03d} {name}: {error} (attempt {attempt + 1}/3)")
                await asyncio.sleep(2 * (attempt + 1))
    return False


def trim_audio_file(path):
    temp = str(path) + ".tmp.mp3"
    try:
        subprocess.run(
            ['ffmpeg', '-i', str(path), '-af', SILENCE_FILTER, '-y', temp],
            capture_output=True, check=True
        )
        os.replace(temp, path)
        return True
    except subprocess.CalledProcessError as error:
        print(f"✗ Failed to trim {path.name}: {error}")
        if os.path.exists(temp):
            os.remove(temp)
        return False


async def main(force):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    names = read_pokemon_names()
    todo = [(pid, name) for pid, name in names if force or not audio_path(pid, name).exists()]
    print(f"{len(names)} Pokemon in {DATA_FILE}, {len(todo)} to generate (voice {VOICE})")

    semaphore = asyncio.Semaphore(CONCURRENCY)
    results = await asyncio.gather(*(generate_one(semaphore, pid, name) for pid, name in todo))
    print(f"\n✓ Generated {sum(results)}/{len(todo)} files")

    files = sorted(OUTPUT_DIR.glob("*.mp3"))
    print(f"\nTrimming silence in {len(files)} files...")
    trimmed = sum(trim_audio_file(path) for path in files)
    print(f"✓ Trimmed {trimmed}/{len(files)} files")

    missing = [name for pid, name in names if not audio_path(pid, name).exists()]
    if missing:
        print(f"\n⚠️  Still missing audio for {len(missing)}: {', '.join(missing[:20])}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--force", action="store_true", help="regenerate files that already exist")
    asyncio.run(main(parser.parse_args().force))
