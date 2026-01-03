#!/usr/bin/env python3
"""
Download pokeball sprites from PokeAPI
Fetches sprites for different pokeball types (Poke Ball, Great Ball, Ultra Ball, Master Ball, etc.)
"""

import requests
import os

# Create directory for pokeball sprites
os.makedirs('public/pokeball_sprites', exist_ok=True)

# Pokeball items to download (item ID: filename)
pokeballs = {
    1: 'master-ball',
    2: 'ultra-ball',
    3: 'great-ball',
    4: 'poke-ball',
    5: 'safari-ball',
    6: 'net-ball',
    7: 'dive-ball',
    8: 'nest-ball',
    9: 'repeat-ball',
    10: 'timer-ball',
    11: 'luxury-ball',
    12: 'premier-ball',
    13: 'dusk-ball',
    14: 'heal-ball',
    15: 'quick-ball',
    16: 'cherish-ball'
}

print("Downloading pokeball sprites from PokeAPI...")

for item_id, filename in pokeballs.items():
    try:
        # Get item data from PokeAPI
        print(f"Fetching {filename}...")
        response = requests.get(f'https://pokeapi.co/api/v2/item/{item_id}')
        response.raise_for_status()

        item_data = response.json()
        sprite_url = item_data['sprites']['default']

        if sprite_url:
            # Download sprite image
            img_response = requests.get(sprite_url)
            img_response.raise_for_status()

            # Save to file
            filepath = f'public/pokeball_sprites/{filename}.png'
            with open(filepath, 'wb') as f:
                f.write(img_response.content)

            print(f"  ✓ Downloaded {filename}.png")
        else:
            print(f"  ✗ No sprite available for {filename}")

    except Exception as e:
        print(f"  ✗ Error downloading {filename}: {e}")

print("\nDone! Pokeball sprites saved to public/pokeball_sprites/")
