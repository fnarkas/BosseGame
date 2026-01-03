#!/usr/bin/env python3
"""
Generate English TTS audio for all 100 Pokemon names using edge-tts
Output: public/pokemon_audio/{id:03d}_{name}.mp3
"""

import asyncio
import edge_tts
import os

# Pokemon names (extracted from pokemonData.js)
POKEMON_NAMES = [
    "Bulbasaur", "Ivysaur", "Venusaur", "Charmander", "Charmeleon", "Charizard",
    "Squirtle", "Wartortle", "Blastoise", "Caterpie", "Metapod", "Butterfree",
    "Weedle", "Kakuna", "Beedrill", "Pidgey", "Pidgeotto", "Pidgeot",
    "Rattata", "Raticate", "Spearow", "Fearow", "Ekans", "Arbok",
    "Pikachu", "Raichu", "Sandshrew", "Sandslash", "Nidoran-f", "Nidorina",
    "Nidoqueen", "Nidoran-m", "Nidorino", "Nidoking", "Clefairy", "Clefable",
    "Vulpix", "Ninetales", "Jigglypuff", "Wigglytuff", "Zubat", "Golbat",
    "Oddish", "Gloom", "Vileplume", "Paras", "Parasect", "Venonat",
    "Venomoth", "Diglett", "Dugtrio", "Meowth", "Persian", "Psyduck",
    "Golduck", "Mankey", "Primeape", "Growlithe", "Arcanine", "Poliwag",
    "Poliwhirl", "Poliwrath", "Abra", "Kadabra", "Alakazam", "Machop",
    "Machoke", "Machamp", "Bellsprout", "Weepinbell", "Victreebel", "Tentacool",
    "Tentacruel", "Geodude", "Graveler", "Golem", "Ponyta", "Rapidash",
    "Slowpoke", "Slowbro", "Magnemite", "Magneton", "Farfetchd", "Doduo",
    "Dodrio", "Seel", "Dewgong", "Grimer", "Muk", "Shellder",
    "Cloyster", "Gastly", "Haunter", "Gengar", "Onix", "Drowzee",
    "Hypno", "Krabby", "Kingler", "Voltorb"
]

# English voice for pronunciation
VOICE = "en-US-GuyNeural"  # Clear, neutral American English

async def generate_pokemon_audio(pokemon_id, name):
    """Generate TTS audio for a single Pokemon"""
    filename = f"public/pokemon_audio/{pokemon_id:03d}_{name.lower().replace('-', '')}.mp3"

    try:
        print(f"Generating #{pokemon_id:03d}: {name}...", end=" ")

        # Create TTS
        tts = edge_tts.Communicate(name, VOICE)
        await tts.save(filename)

        print(f"✓ Saved {filename}")
        return True
    except Exception as e:
        print(f"✗ Error: {e}")
        return False

async def main():
    # Create output directory if it doesn't exist
    os.makedirs("public/pokemon_audio", exist_ok=True)

    print(f"Generating English TTS audio for all {len(POKEMON_NAMES)} Pokemon...")
    print(f"Voice: {VOICE}")
    print(f"Output: public/pokemon_audio/\n")

    # Generate all audio files in parallel
    tasks = [
        generate_pokemon_audio(i + 1, name)
        for i, name in enumerate(POKEMON_NAMES)
    ]

    results = await asyncio.gather(*tasks)

    successful = sum(results)
    print(f"\n✓ Successfully generated {successful}/{len(POKEMON_NAMES)} audio files")
    print("Done! Audio files are ready to use in the game.")

if __name__ == "__main__":
    asyncio.run(main())
