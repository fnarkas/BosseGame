#!/usr/bin/env python3
"""
Download images of the first 151 Gen 1 Pokémon from PokéAPI.
"""
import requests
import os
from pathlib import Path


def download_pokemon_images(num_pokemon=151, output_dir="pokemon_images"):
    """
    Download images of the first num_pokemon Pokémon.

    Args:
        num_pokemon: Number of Pokémon to download (default: 151)
        output_dir: Directory to save images (default: "pokemon_images")
    """
    # Create output directory if it doesn't exist
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    print(f"Downloading images for the first {num_pokemon} Pokémon...")

    for pokemon_id in range(1, num_pokemon + 1):
        try:
            # Fetch Pokémon data from PokéAPI
            url = f"https://pokeapi.co/api/v2/pokemon/{pokemon_id}"
            response = requests.get(url, timeout=10)
            response.raise_for_status()

            pokemon_data = response.json()
            pokemon_name = pokemon_data['name']

            # Get the official artwork URL (high quality image)
            image_url = pokemon_data['sprites']['other']['official-artwork']['front_default']

            if image_url:
                # Download the image
                image_response = requests.get(image_url, timeout=10)
                image_response.raise_for_status()

                # Save the image with format: 001_bulbasaur.png
                filename = f"{pokemon_id:03d}_{pokemon_name}.png"
                filepath = os.path.join(output_dir, filename)

                with open(filepath, 'wb') as f:
                    f.write(image_response.content)

                print(f"✓ Downloaded: {filename}")
            else:
                print(f"✗ No image available for {pokemon_name} (#{pokemon_id})")

        except requests.exceptions.RequestException as e:
            print(f"✗ Error downloading Pokémon #{pokemon_id}: {e}")
        except KeyError as e:
            print(f"✗ Error parsing data for Pokémon #{pokemon_id}: {e}")

    print(f"\nDownload complete! Images saved in '{output_dir}' directory.")


if __name__ == "__main__":
    download_pokemon_images(num_pokemon=151)
