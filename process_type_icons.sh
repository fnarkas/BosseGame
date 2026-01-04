#!/bin/bash
# Process type icons to create circular icon-only versions
# Crops the left portion with the icon and creates a circular background

INPUT_DIR="public/type_icons"
OUTPUT_DIR="public/type_icons_circular"

# Create output directory
mkdir -p "$OUTPUT_DIR"

echo "Processing type icons..."

# Process each type icon (1-18)
for i in {1..18}; do
    INPUT_FILE="$INPUT_DIR/${i}.png"
    OUTPUT_FILE="$OUTPUT_DIR/${i}.png"

    if [ -f "$INPUT_FILE" ]; then
        echo "Processing type icon ${i}..."

        # Strategy: Crop left 60x40 pixels (icon area with rounded right edge)
        # Then create a circular mask and composite
        convert "$INPUT_FILE" \
            -crop 60x40+0+0 +repage \
            \( +clone -alpha extract \
               -draw 'fill black polygon 0,0 0,40 60,40 60,0' \
               -draw 'fill white circle 30,20 30,0' \
            \) \
            -alpha off -compose CopyOpacity -composite \
            "$OUTPUT_FILE"

        echo "  ✓ Created $OUTPUT_FILE"
    else
        echo "  ✗ File not found: $INPUT_FILE"
    fi
done

echo ""
echo "✓ Processing complete! Created circular icons in $OUTPUT_DIR"
