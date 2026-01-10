#!/usr/bin/env python3
"""
Fetch comprehensive Pokemon data from PokeAPI and generate pokemonData.js
Fetches types, stats, height, and weight for all 151 Gen 1 Pokemon
"""

import requests
import json
import re

# Existing filename mappings (read from current pokemonData.js)
FILENAME_MAP = {
    1: "001_bulbasaur.png", 2: "002_ivysaur.png", 3: "003_venusaur.png",
    4: "004_charmander.png", 5: "005_charmeleon.png", 6: "006_charizard.png",
    7: "007_squirtle.png", 8: "008_wartortle.png", 9: "009_blastoise.png",
    10: "010_caterpie.png", 11: "011_metapod.png", 12: "012_butterfree.png",
    13: "013_weedle.png", 14: "014_kakuna.png", 15: "015_beedrill.png",
    16: "016_pidgey.png", 17: "017_pidgeotto.png", 18: "018_pidgeot.png",
    19: "019_rattata.png", 20: "020_raticate.png", 21: "021_spearow.png",
    22: "022_fearow.png", 23: "023_ekans.png", 24: "024_arbok.png",
    25: "025_pikachu.png", 26: "026_raichu.png", 27: "027_sandshrew.png",
    28: "028_sandslash.png", 29: "029_nidoran-f.png", 30: "030_nidorina.png",
    31: "031_nidoqueen.png", 32: "032_nidoran-m.png", 33: "033_nidorino.png",
    34: "034_nidoking.png", 35: "035_clefairy.png", 36: "036_clefable.png",
    37: "037_vulpix.png", 38: "038_ninetales.png", 39: "039_jigglypuff.png",
    40: "040_wigglytuff.png", 41: "041_zubat.png", 42: "042_golbat.png",
    43: "043_oddish.png", 44: "044_gloom.png", 45: "045_vileplume.png",
    46: "046_paras.png", 47: "047_parasect.png", 48: "048_venonat.png",
    49: "049_venomoth.png", 50: "050_diglett.png", 51: "051_dugtrio.png",
    52: "052_meowth.png", 53: "053_persian.png", 54: "054_psyduck.png",
    55: "055_golduck.png", 56: "056_mankey.png", 57: "057_primeape.png",
    58: "058_growlithe.png", 59: "059_arcanine.png", 60: "060_poliwag.png",
    61: "061_poliwhirl.png", 62: "062_poliwrath.png", 63: "063_abra.png",
    64: "064_kadabra.png", 65: "065_alakazam.png", 66: "066_machop.png",
    67: "067_machoke.png", 68: "068_machamp.png", 69: "069_bellsprout.png",
    70: "070_weepinbell.png", 71: "071_victreebel.png", 72: "072_tentacool.png",
    73: "073_tentacruel.png", 74: "074_geodude.png", 75: "075_graveler.png",
    76: "076_golem.png", 77: "077_ponyta.png", 78: "078_rapidash.png",
    79: "079_slowpoke.png", 80: "080_slowbro.png", 81: "081_magnemite.png",
    82: "082_magneton.png", 83: "083_farfetchd.png", 84: "084_doduo.png",
    85: "085_dodrio.png", 86: "086_seel.png", 87: "087_dewgong.png",
    88: "088_grimer.png", 89: "089_muk.png", 90: "090_shellder.png",
    91: "091_cloyster.png", 92: "092_gastly.png", 93: "093_haunter.png",
    94: "094_gengar.png", 95: "095_onix.png", 96: "096_drowzee.png",
    97: "097_hypno.png", 98: "098_krabby.png", 99: "099_kingler.png",
    100: "100_voltorb.png",
    101: "101_electrode.png", 102: "102_exeggcute.png", 103: "103_exeggutor.png",
    104: "104_cubone.png", 105: "105_marowak.png", 106: "106_hitmonlee.png",
    107: "107_hitmonchan.png", 108: "108_lickitung.png", 109: "109_koffing.png",
    110: "110_weezing.png", 111: "111_rhyhorn.png", 112: "112_rhydon.png",
    113: "113_chansey.png", 114: "114_tangela.png", 115: "115_kangaskhan.png",
    116: "116_horsea.png", 117: "117_seadra.png", 118: "118_goldeen.png",
    119: "119_seaking.png", 120: "120_staryu.png", 121: "121_starmie.png",
    122: "122_mr-mime.png", 123: "123_scyther.png", 124: "124_jynx.png",
    125: "125_electabuzz.png", 126: "126_magmar.png", 127: "127_pinsir.png",
    128: "128_tauros.png", 129: "129_magikarp.png", 130: "130_gyarados.png",
    131: "131_lapras.png", 132: "132_ditto.png", 133: "133_eevee.png",
    134: "134_vaporeon.png", 135: "135_jolteon.png", 136: "136_flareon.png",
    137: "137_porygon.png", 138: "138_omanyte.png", 139: "139_omastar.png",
    140: "140_kabuto.png", 141: "141_kabutops.png", 142: "142_aerodactyl.png",
    143: "143_snorlax.png", 144: "144_articuno.png", 145: "145_zapdos.png",
    146: "146_moltres.png", 147: "147_dratini.png", 148: "148_dragonair.png",
    149: "149_dragonite.png", 150: "150_mewtwo.png", 151: "151_mew.png"
}

print("Fetching comprehensive Pokemon data from PokeAPI...")
print("This will fetch data for all 151 Gen 1 Pokemon (may take a few minutes)\n")

pokemon_data = []

for pokemon_id in range(1, 152):
    try:
        print(f"Fetching Pokemon #{pokemon_id}...", end=" ")

        # Fetch Pokemon data from API
        response = requests.get(f'https://pokeapi.co/api/v2/pokemon/{pokemon_id}')
        response.raise_for_status()
        data = response.json()

        # Extract type IDs
        types = []
        for type_data in data['types']:
            type_url = type_data['type']['url']
            type_id = int(type_url.rstrip('/').split('/')[-1])
            types.append(type_id)

        # Extract stats
        stats = {}
        stat_name_map = {
            'hp': 'hp',
            'attack': 'attack',
            'defense': 'defense',
            'special-attack': 'specialAttack',
            'special-defense': 'specialDefense',
            'speed': 'speed'
        }

        for stat_data in data['stats']:
            stat_name = stat_data['stat']['name']
            if stat_name in stat_name_map:
                stats[stat_name_map[stat_name]] = stat_data['base_stat']

        # Create Pokemon entry
        pokemon_entry = {
            'id': pokemon_id,
            'name': data['name'].capitalize(),
            'filename': FILENAME_MAP[pokemon_id],
            'types': types,
            'height': data['height'],
            'weight': data['weight'],
            'stats': stats
        }

        pokemon_data.append(pokemon_entry)
        print(f"✓ {pokemon_entry['name']}")

    except Exception as e:
        print(f"✗ Error: {e}")
        continue

print(f"\n✓ Successfully fetched data for {len(pokemon_data)} Pokemon")

# Generate JavaScript file
print("\nGenerating src/pokemonData.js...")

js_content = "// All 151 Gen 1 Pokemon data\n// Generated by fetch_pokemon_data.py - DO NOT EDIT MANUALLY\n"
js_content += "export const POKEMON_DATA = [\n"

for i, pokemon in enumerate(pokemon_data):
    # Format types array
    types_str = json.dumps(pokemon['types'])

    # Format stats object
    stats_str = json.dumps(pokemon['stats'], indent=4)
    stats_str = stats_str.replace('\n', '\n        ')  # Indent properly

    # Create Pokemon entry
    entry = f"    {{\n"
    entry += f"        id: {pokemon['id']},\n"
    entry += f"        name: \"{pokemon['name']}\",\n"
    entry += f"        filename: \"{pokemon['filename']}\",\n"
    entry += f"        types: {types_str},\n"
    entry += f"        height: {pokemon['height']},\n"
    entry += f"        weight: {pokemon['weight']},\n"
    entry += f"        stats: {stats_str}\n"
    entry += f"    }}"

    # Add comma if not last
    if i < len(pokemon_data) - 1:
        entry += ","

    entry += "\n"
    js_content += entry

js_content += "];\n"

# Write to file
with open('src/pokemonData.js', 'w') as f:
    f.write(js_content)

print("✓ Successfully generated src/pokemonData.js")
print(f"\nDone! Enhanced data for {len(pokemon_data)} Pokemon")
