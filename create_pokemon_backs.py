#!/usr/bin/env python3
"""
Create a PDF with Pokémon numbers on the back of cards for printing.
The layout is mirrored horizontally to align with the front when paper is flipped.
"""
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from pathlib import Path


def create_pokemon_backs_pdf(
    image_dir="pokemon_images",
    output_pdf="pokemon_backs.pdf",
    cards_per_row=3,
    cards_per_col=3
):
    """
    Create a PDF with Pokémon numbers for the back of cards.

    Args:
        image_dir: Directory containing Pokémon images (to count them)
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

    # Calculate card dimensions (same as front)
    margin = 10 * mm
    usable_width = page_width - (2 * margin)
    usable_height = page_height - (2 * margin)

    card_width = usable_width / cards_per_row
    card_height = usable_height / cards_per_col

    # Create PDF
    c = canvas.Canvas(output_pdf, pagesize=A4)

    cards_per_page = cards_per_row * cards_per_col
    total_pages = (len(image_files) + cards_per_page - 1) // cards_per_page

    print(f"Creating backs PDF with {total_pages} pages...")

    for page_num in range(total_pages):
        print(f"Generating page {page_num + 1}/{total_pages}...")

        start_idx = page_num * cards_per_page
        end_idx = min(start_idx + cards_per_page, len(image_files))
        page_images = image_files[start_idx:end_idx]

        for idx, image_path in enumerate(page_images):
            # Calculate position in grid
            row = idx // cards_per_row
            col = idx % cards_per_row

            # MIRROR HORIZONTALLY: flip the column position
            # When you flip paper horizontally, left becomes right
            mirrored_col = (cards_per_row - 1) - col

            # Calculate x, y position (reportlab uses bottom-left origin)
            x = margin + (mirrored_col * card_width)
            y = page_height - margin - ((row + 1) * card_height)

            # Extract Pokémon number and name from filename (format: 001_bulbasaur.png)
            parts = image_path.stem.split('_', 1)
            pokemon_number = str(int(parts[0]))  # Remove leading zeros
            pokemon_name = parts[1].upper() if len(parts) > 1 else ""

            try:
                # Draw the Pokémon number large and centered
                c.setFont("Helvetica-Bold", 48)
                text_x = x + (card_width / 2)
                text_y = y + (card_height / 2)
                c.drawCentredString(text_x, text_y, pokemon_number)

                # Draw the Pokémon name below the number
                c.setFont("Helvetica-Bold", 14)
                name_y = text_y - 20 * mm
                c.drawCentredString(text_x, name_y, pokemon_name)

                # Optional: Draw border around each card for alignment check
                c.setStrokeColorRGB(0.8, 0.8, 0.8)
                c.setLineWidth(0.5)
                c.rect(x, y, card_width, card_height, stroke=1, fill=0)

            except Exception as e:
                print(f"Error processing {image_path.name}: {e}")

        # Finish the page
        c.showPage()

    # Save the PDF
    c.save()
    print(f"\n✓ Backs PDF created successfully: {output_pdf}")
    print(f"  Total cards: {len(image_files)}")
    print(f"  Pages: {total_pages}")
    print(f"  Grid: {cards_per_row}x{cards_per_col} cards per page")
    print("\nPrinting instructions:")
    print("1. Print 'pokemon_cards.pdf' (fronts) first")
    print("2. Flip the printed pages horizontally (like turning a book page)")
    print("3. Put them back in the printer")
    print("4. Print 'pokemon_backs.pdf' on the back side")


if __name__ == "__main__":
    create_pokemon_backs_pdf(
        image_dir="pokemon_images",
        output_pdf="pokemon_backs.pdf",
        cards_per_row=3,  # Must match the front
        cards_per_col=3   # Must match the front
    )
