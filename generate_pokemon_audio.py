#!/usr/bin/env python3
"""
Generate English TTS audio for every Pokemon name in src/pokemonData.js using
edge-tts, then trim the leading/trailing silence edge-tts adds.
Output: public/pokemon_audio/{id:03d}_{name}.mp3 (existing files are kept)
"""

import asyncio
import os
import re
import subprocess

import edge_tts

DATA_FILE = 'src/pokemonData.js'
OUT_DIR = 'public/pokemon_audio'
VOICE = "en-US-GuyNeural"  # Clear, neutral American English
CONCURRENCY = 12


def pokemon_names():
    src = open(DATA_FILE, encoding='utf-8').read()
    return [(int(pid), name) for pid, name in re.findall(r'id: (\d+),\n\s+name: "([^"]+)"', src)]


def audio_filename(pokemon_id, name):
    # Must match pokemonAudioAsset() in src/assetManifest.js
    return f"{OUT_DIR}/{pokemon_id:03d}_{name.lower().replace('-', '')}.mp3"


def trim_silence(path):
    temp = path + '.tmp.mp3'
    subprocess.run([
        'ffmpeg', '-i', path,
        '-af', 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05:stop_periods=-1:stop_threshold=-50dB:stop_silence=0.05',
        '-y', temp
    ], capture_output=True, check=True)
    os.replace(temp, path)


async def generate_one(semaphore, pokemon_id, name):
    filename = audio_filename(pokemon_id, name)
    if os.path.exists(filename):
        return True
    spoken = name.replace('-', ' ')
    async with semaphore:
        for attempt in range(3):
            try:
                await edge_tts.Communicate(spoken, VOICE).save(filename)
                trim_silence(filename)
                print(f"✓ #{pokemon_id:03d} {name}", flush=True)
                return True
            except Exception as e:
                print(f"✗ #{pokemon_id:03d} {name} (attempt {attempt + 1}): {e}", flush=True)
                if os.path.exists(filename):
                    os.remove(filename)
                await asyncio.sleep(2 * (attempt + 1))
    return False


async def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    names = pokemon_names()
    print(f"Generating English TTS audio for {len(names)} Pokemon (voice {VOICE})...")
    semaphore = asyncio.Semaphore(CONCURRENCY)
    results = await asyncio.gather(*(generate_one(semaphore, pid, name) for pid, name in names))
    print(f"\n✓ {sum(results)}/{len(names)} audio files present")


if __name__ == "__main__":
    asyncio.run(main())
