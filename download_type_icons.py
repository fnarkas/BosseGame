#!/usr/bin/env python3
"""
Download Pokemon type icons from PokeAPI
Fetches type icons for all 18 Pokemon types from Generation IX (Scarlet/Violet)
"""

import requests
import os

# Create directory for type icons
os.makedirs('public/type_icons', exist_ok=True)

# All 18 Pokemon types (type_id: type_name)
types = {
    1: 'normal',
    2: 'fighting',
    3: 'flying',
    4: 'poison',
    5: 'ground',
    6: 'rock',
    7: 'bug',
    8: 'ghost',
    9: 'steel',
    10: 'fire',
    11: 'water',
    12: 'grass',
    13: 'electric',
    14: 'psychic',
    15: 'ice',
    16: 'dragon',
    17: 'dark',
    18: 'fairy'
}

# Base URL for type icons (Generation IX - Scarlet/Violet for modern look)
BASE_URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/types/generation-ix/scarlet-violet'

print("Downloading Pokemon type icons from PokeAPI...")

for type_id, type_name in types.items():
    try:
        # Construct sprite URL
        sprite_url = f'{BASE_URL}/{type_id}.png'

        print(f"Fetching {type_name} ({type_id})...")

        # Download type icon
        response = requests.get(sprite_url)
        response.raise_for_status()

        # Save to file using type_id as filename
        filepath = f'public/type_icons/{type_id}.png'
        with open(filepath, 'wb') as f:
            f.write(response.content)

        print(f"  ✓ Downloaded {type_name}.png (type_{type_id}.png)")

    except Exception as e:
        print(f"  ✗ Error downloading {type_name}: {e}")

print("\nDone! Type icons saved to public/type_icons/")
print("\nType ID mapping:")
for type_id, type_name in types.items():
    print(f"  {type_id}.png = {type_name}")
