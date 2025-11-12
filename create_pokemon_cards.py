#!/usr/bin/env python3
"""
Create a PDF with Pokémon cards in a grid layout for printing on A4 paper.
"""
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from PIL import Image
import os
from pathlib import Path


def create_pokemon_cards_pdf(
    image_dir="pokemon_images",
    output_pdf="pokemon_cards.pdf",
    cards_per_row=3,
    cards_per_col=3
):
    """
    Create a PDF with Pokémon cards in a grid layout.

    Args:
        image_dir: Directory containing Pokémon images
        output_pdf: Output PDF filename
        cards_per_row: Number of cards per row (default: 3)
        cards_per_col: Number of cards per column (default: 3)
    """
    # Get all PNG files from the directory
    image_files = sorted(Path(image_dir).glob("*.png"))

    if not image_files:
        print(f"No images found in '{image_dir}' directory!")
        return

    print(f"Found {len(image_files)} Pokémon images")

    # A4 dimensions
    page_width, page_height = A4

    # Calculate card dimensions
    margin = 10 * mm
    usable_width = page_width - (2 * margin)
    usable_height = page_height - (2 * margin)

    card_width = usable_width / cards_per_row
    card_height = usable_height / cards_per_col

    # Image and text sizing
    image_padding = 5 * mm
    text_height = 8 * mm
    image_height = card_height - text_height - (2 * image_padding)
    image_width = card_width - (2 * image_padding)

    # Create PDF
    c = canvas.Canvas(output_pdf, pagesize=A4)

    cards_per_page = cards_per_row * cards_per_col
    total_pages = (len(image_files) + cards_per_page - 1) // cards_per_page

    print(f"Creating PDF with {total_pages} pages...")

    for page_num in range(total_pages):
        print(f"Generating page {page_num + 1}/{total_pages}...")

        start_idx = page_num * cards_per_page
        end_idx = min(start_idx + cards_per_page, len(image_files))
        page_images = image_files[start_idx:end_idx]

        for idx, image_path in enumerate(page_images):
            # Calculate position in grid
            row = idx // cards_per_row
            col = idx % cards_per_row

            # Calculate x, y position (reportlab uses bottom-left origin)
            x = margin + (col * card_width)
            y = page_height - margin - ((row + 1) * card_height)

            # Extract Pokémon name from filename (format: 001_bulbasaur.png)
            pokemon_name = image_path.stem.split('_', 1)[1] if '_' in image_path.stem else image_path.stem
            pokemon_name = pokemon_name.upper()

            try:
                # Draw the image
                img_x = x + image_padding
                img_y = y + text_height + image_padding

                # Draw image maintaining aspect ratio with transparency support
                c.drawImage(
                    str(image_path),
                    img_x,
                    img_y,
                    width=image_width,
                    height=image_height,
                    preserveAspectRatio=True,
                    anchor='c',
                    mask='auto'  # Enable transparency
                )

                # Draw the Pokémon name
                c.setFont("Helvetica-Bold", 10)
                text_y = y + (text_height / 2) - 2
                text_x = x + (card_width / 2)
                c.drawCentredString(text_x, text_y, pokemon_name)

                # Optional: Draw border around each card for cutting guide
                c.setStrokeColorRGB(0.8, 0.8, 0.8)
                c.setLineWidth(0.5)
                c.rect(x, y, card_width, card_height, stroke=1, fill=0)

            except Exception as e:
                print(f"Error processing {image_path.name}: {e}")

        # Finish the page
        c.showPage()

    # Save the PDF
    c.save()
    print(f"\n✓ PDF created successfully: {output_pdf}")
    print(f"  Total cards: {len(image_files)}")
    print(f"  Pages: {total_pages}")
    print(f"  Grid: {cards_per_row}x{cards_per_col} cards per page")


if __name__ == "__main__":
    create_pokemon_cards_pdf(
        image_dir="pokemon_images",
        output_pdf="pokemon_cards.pdf",
        cards_per_row=3,  # 3 columns
        cards_per_col=3   # 3 rows = 9 cards per page
    )
