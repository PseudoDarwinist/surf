#!/usr/bin/env python3
"""
Docling converter for Surf app - AI-powered document conversion.

This script converts documents (PDF, EPUB, DOCX, PPTX) to markdown using
IBM's Docling library with advanced AI models:
- Granite-Docling-258M (VLM): Enhanced equation recognition and LaTeX conversion
- DocLayNet: Document layout understanding
- TableFormer: Table structure recognition
- OCR: Multi-language text extraction

Key advantage over MarkItDown: Extracts images with bounding box coordinates,
associates figures with their captions, and properly handles mathematical equations.

Usage:
    python3 docling_converter.py /path/to/document.pdf --output-dir /path/to/images
    python3 docling_converter.py /path/to/document.pdf --vlm  # Use VLM for better math

Output (JSON):
    {
        "markdown": "# Document Title\n\n...",
        "title": "Document Title",
        "images": [
            {
                "path": "/abs/path/image1.png",
                "page": 5,
                "bbox": {"x": 100, "y": 200, "width": 400, "height": 300},
                "caption": "Figure 1.2: Description",
                "figureNumber": "1.2"
            }
        ],
        "figureCaptions": {"1.2": "Description text", "2.1": "Another caption"},
        "pageCount": 42
    }

Install dependencies:
    pip install docling
    pip install docling[vlm]  # For VLM pipeline with equation recognition
    pip install pymupdf  # For high-quality equation image extraction
"""

import sys
import json
import re
import os
import argparse
import tempfile
import base64
from pathlib import Path


def extract_equation_images(file_path: str, doc, output_dir: str) -> tuple[list, dict]:
    """
    Extract equation/formula regions from the PDF as high-quality images.

    This renders each equation region as a crisp image with padding,
    providing a perfect visual representation instead of garbled OCR text.

    Args:
        file_path: Path to the PDF file
        doc: Docling document object with formula items
        output_dir: Directory to save equation images

    Returns:
        Tuple of (equation_images list, equation_replacements dict)
        - equation_images: List of image info dicts
        - equation_replacements: Map of equation index to base64 image data
    """
    try:
        import fitz  # PyMuPDF
    except ImportError:
        print("[Docling] PyMuPDF not installed, skipping equation image extraction", file=sys.stderr)
        print("[Docling] Install with: pip install pymupdf", file=sys.stderr)
        return [], {}

    equation_images = []
    equation_replacements = {}

    # Collect formula items with their bounding boxes
    formulas = []
    for text_item in doc.texts:
        label = getattr(text_item, 'label', None)
        if label == 'formula':
            prov = text_item.prov[0] if hasattr(text_item, 'prov') and text_item.prov else None
            if prov and hasattr(prov, 'bbox') and hasattr(prov, 'page_no'):
                bbox = prov.bbox
                formulas.append({
                    'page': prov.page_no,
                    'bbox': bbox,
                    'item': text_item
                })

    if not formulas:
        print("[Docling] No formulas found in document", file=sys.stderr)
        return [], {}

    print(f"[Docling] Extracting {len(formulas)} equations as images...", file=sys.stderr)

    # Open the PDF with PyMuPDF
    try:
        pdf_doc = fitz.open(file_path)
    except Exception as e:
        print(f"[Docling] Failed to open PDF for equation extraction: {e}", file=sys.stderr)
        return [], {}

    try:
        for idx, formula in enumerate(formulas):
            try:
                page_num = formula['page']
                bbox = formula['bbox']

                # PyMuPDF uses 0-indexed pages
                if page_num < 1 or page_num > len(pdf_doc):
                    continue

                page = pdf_doc[page_num - 1]

                # Get page dimensions to handle coordinate system
                page_rect = page.rect
                page_height = page_rect.height

                # Docling bbox: (left, top, right, bottom) in PDF coordinates
                # Add generous padding for a clean look
                padding_x = 15  # Horizontal padding
                padding_y = 10  # Vertical padding

                # Create clip rectangle with padding
                # Note: PDF coordinates have origin at bottom-left, but PyMuPDF uses top-left
                clip_rect = fitz.Rect(
                    max(0, bbox.l - padding_x),
                    max(0, page_height - bbox.t - padding_y),  # Convert Y coordinate
                    min(page_rect.width, bbox.r + padding_x),
                    min(page_height, page_height - bbox.b + padding_y)  # Convert Y coordinate
                )

                # Ensure valid rectangle
                if clip_rect.width <= 0 or clip_rect.height <= 0:
                    print(f"[Docling] Invalid bbox for equation {idx + 1}, skipping", file=sys.stderr)
                    continue

                # Render at high resolution (3x for crisp equations)
                zoom = 3.0
                mat = fitz.Matrix(zoom, zoom)

                # Render the clipped region
                pix = page.get_pixmap(matrix=mat, clip=clip_rect, alpha=False)

                # Convert to PNG bytes
                png_bytes = pix.tobytes("png")

                # Save to file
                image_filename = f"equation_{idx + 1}.png"
                image_path = os.path.join(output_dir, image_filename)

                with open(image_path, 'wb') as f:
                    f.write(png_bytes)

                # Also create base64 for inline embedding
                b64_data = base64.b64encode(png_bytes).decode('utf-8')

                equation_images.append({
                    "path": image_path,
                    "page": page_num,
                    "index": idx,
                    "alt": f"Equation {idx + 1}",
                    "type": "equation",
                    "bbox": {
                        "x": bbox.l,
                        "y": bbox.t,
                        "width": bbox.r - bbox.l,
                        "height": bbox.t - bbox.b
                    }
                })

                # Store base64 for markdown replacement
                equation_replacements[idx] = f"![Equation {idx + 1}](data:image/png;base64,{b64_data})"

                print(f"[Docling] Extracted equation {idx + 1} from page {page_num}", file=sys.stderr)

            except Exception as e:
                print(f"[Docling] Failed to extract equation {idx + 1}: {e}", file=sys.stderr)
                continue

    finally:
        pdf_doc.close()

    print(f"[Docling] Successfully extracted {len(equation_images)} equation images", file=sys.stderr)
    return equation_images, equation_replacements


def replace_formula_text_with_images(markdown: str, doc, equation_replacements: dict) -> str:
    """
    Replace formula text in markdown with equation images.

    Docling exports formulas as text (often garbled OCR), this replaces
    those with the high-quality equation images we extracted.

    Args:
        markdown: The markdown content
        doc: Docling document object
        equation_replacements: Map of equation index to image markdown

    Returns:
        Markdown with formula text replaced by images
    """
    if not equation_replacements:
        return markdown

    # Collect formula texts to replace
    formula_texts = []
    for text_item in doc.texts:
        label = getattr(text_item, 'label', None)
        if label == 'formula':
            text_content = str(text_item.text).strip() if hasattr(text_item, 'text') else ''
            if text_content:
                formula_texts.append(text_content)

    # Replace each formula text with its image
    result = markdown
    for idx, (eq_idx, img_markdown) in enumerate(equation_replacements.items()):
        if idx < len(formula_texts) and formula_texts[idx]:
            # Escape special regex characters in the formula text
            escaped_text = re.escape(formula_texts[idx])
            # Replace the formula text with the image, adding newlines for clean display
            result = re.sub(
                escaped_text,
                f"\n\n{img_markdown}\n\n",
                result,
                count=1  # Only replace first occurrence
            )

    # Clean up excessive newlines
    result = re.sub(r'\n{4,}', '\n\n\n', result)

    return result


def get_bbox_overlap(bbox1: dict, bbox2: dict, threshold: float = 0.5) -> bool:
    """
    Check if two bounding boxes overlap significantly.

    Args:
        bbox1: First bounding box with x, y, width, height
        bbox2: Second bounding box with x, y, width, height
        threshold: Minimum overlap ratio (0-1) to consider as overlapping

    Returns:
        True if bboxes overlap more than threshold
    """
    if not bbox1 or not bbox2:
        return False

    # Calculate intersection
    x1 = max(bbox1.get('x', 0), bbox2.get('x', 0))
    y1 = max(bbox1.get('y', 0), bbox2.get('y', 0))
    x2 = min(bbox1.get('x', 0) + bbox1.get('width', 0),
             bbox2.get('x', 0) + bbox2.get('width', 0))
    y2 = min(bbox1.get('y', 0) + bbox1.get('height', 0),
             bbox2.get('y', 0) + bbox2.get('height', 0))

    if x2 <= x1 or y2 <= y1:
        return False  # No intersection

    intersection_area = (x2 - x1) * (y2 - y1)
    bbox1_area = bbox1.get('width', 0) * bbox1.get('height', 0)

    if bbox1_area == 0:
        return False

    overlap_ratio = intersection_area / bbox1_area
    return overlap_ratio >= threshold


def filter_ocr_text_from_figures(doc, picture_bboxes: list) -> None:
    """
    Remove text items that fall within picture bounding boxes.
    This removes OCR'd text from inside figures/diagrams.

    Args:
        doc: Docling document object
        picture_bboxes: List of dicts with page, bbox info for each picture
    """
    if not picture_bboxes:
        return

    # Build a lookup by page for faster matching
    bboxes_by_page = {}
    for pic_info in picture_bboxes:
        page = pic_info.get('page', 1)
        if page not in bboxes_by_page:
            bboxes_by_page[page] = []
        if pic_info.get('bbox'):
            bboxes_by_page[page].append(pic_info['bbox'])

    if not bboxes_by_page:
        print("[Docling] No picture bounding boxes to filter against", file=sys.stderr)
        return

    # Track items to remove (store indices and their containers)
    items_filtered = 0

    # Try different properties where text items might be stored
    text_containers = []

    # Check for 'texts' property
    if hasattr(doc, 'texts') and doc.texts:
        text_containers.append(('texts', doc.texts))

    # Check for 'body' property (some Docling versions)
    if hasattr(doc, 'body') and doc.body:
        if hasattr(doc.body, 'children'):
            text_containers.append(('body.children', doc.body.children))

    # Check for 'main_text' property
    if hasattr(doc, 'main_text') and doc.main_text:
        text_containers.append(('main_text', doc.main_text))

    for container_name, container in text_containers:
        items_to_remove = []

        for idx, item in enumerate(container):
            # Skip if not a text item or doesn't have provenance
            if not hasattr(item, 'prov') or not item.prov:
                continue

            prov = item.prov[0] if isinstance(item.prov, list) else item.prov
            if not hasattr(prov, 'page_no') or not hasattr(prov, 'bbox'):
                continue

            page = prov.page_no
            if page not in bboxes_by_page:
                continue

            # Get text bbox
            b = prov.bbox
            text_bbox = {
                "x": b.l,
                "y": b.t,
                "width": b.r - b.l,
                "height": b.b - b.t
            }

            # Check if text overlaps with any picture on this page
            for pic_bbox in bboxes_by_page[page]:
                if get_bbox_overlap(text_bbox, pic_bbox, threshold=0.3):
                    items_to_remove.append(idx)
                    text_preview = str(item.text)[:50] if hasattr(item, 'text') else 'unknown'
                    print(f"[Docling] Filtering from {container_name}: '{text_preview}...'", file=sys.stderr)
                    break

        # Remove items in reverse order to maintain indices
        for idx in sorted(items_to_remove, reverse=True):
            try:
                del container[idx]
                items_filtered += 1
            except (IndexError, TypeError, AttributeError):
                pass

    if items_filtered > 0:
        print(f"[Docling] Filtered {items_filtered} OCR text items from within figures", file=sys.stderr)
    else:
        print("[Docling] No OCR text items found to filter (doc structure may differ)", file=sys.stderr)


def clean_markdown_ocr_fragments(markdown: str) -> str:
    """
    Post-process markdown to remove OCR fragments that appear as isolated short lines.
    This is a fallback when document model filtering doesn't work.

    Removes lines that:
    - Are very short (< 25 chars)
    - Don't look like real content (just single words, numbers, or fragments)
    - Appear isolated (surrounded by blank lines or other fragments)
    """
    lines = markdown.split('\n')
    cleaned_lines = []
    i = 0

    # Patterns that look like OCR fragments from figures/diagrams
    ocr_fragment_patterns = [
        r'^[a-z]$',  # Single lowercase letter like "a", "b", "c", "n"
        r'^[A-Z][a-z]?$',  # One or two letters starting with capital
        r'^f[a-z]$',  # Common pattern like "fa", "fb", "fc" (neural network annotations)
        r'^W[a-z]{2}$',  # Weight labels like "Wab", "Wbc"
        r'^\d+$',  # Just numbers
        r'^[A-Z]{2,4}$',  # Short all-caps like "ADM", "ANN"
        r'^[A-Z][a-z]+ Feat$',  # "Alea Feat", "Epis Feat" patterns
        r'^[A-Z][a-z]+ Feat \d*$',  # "Alea Feat 1", "Epis Feat 2"
        r'^(Input|Hidden|Output) Layer$',  # Layer labels from neural network diagrams
        r'^(Target|Test|Compare|Predicted)$',  # Common diagram labels
        r'^Adjustment of .+$',  # Caption-like text from diagrams
        r'^[A-Z][a-z]+ [A-Z][a-z]+$',  # Two capitalized words (common diagram labels)
    ]

    # Also track consecutive short isolated lines (often OCR fragments cluster together)
    def is_short_isolated(idx: int, text: str) -> bool:
        """Check if a line appears to be a short, isolated text fragment"""
        if len(text) > 25 or len(text) == 0:
            return False

        # Skip markdown formatting
        if text.startswith('#') or text.startswith('!') or text.startswith('['):
            return False

        # Skip list items that have real content
        if text.startswith('-') or text.startswith('*') or re.match(r'^\d+\.', text):
            return False

        # Check surrounding context
        prev_empty = (idx == 0) or (lines[idx-1].strip() == '')
        next_empty = (idx >= len(lines) - 1) or (lines[idx+1].strip() == '')

        # Also check if prev/next are short fragments (clustering)
        prev_short = (idx > 0) and (len(lines[idx-1].strip()) < 25)
        next_short = (idx < len(lines) - 1) and (len(lines[idx+1].strip()) < 25)

        return (prev_empty or prev_short) and (next_empty or next_short)

    while i < len(lines):
        line = lines[i].strip()
        is_fragment = False

        # Check against explicit patterns
        for pattern in ocr_fragment_patterns:
            if re.match(pattern, line, re.IGNORECASE):
                if is_short_isolated(i, line):
                    is_fragment = True
                    print(f"[Docling] Removing OCR fragment (pattern): '{line}'", file=sys.stderr)
                    break

        # Additional heuristic: very short isolated lines without punctuation
        if not is_fragment and len(line) > 0 and len(line) < 15:
            # No punctuation and no markdown = likely OCR fragment
            if not any(p in line for p in '.,:;!?-#*[]()'):
                if is_short_isolated(i, line):
                    # Check it's not a real short word/phrase
                    word_count = len(line.split())
                    if word_count <= 2:
                        is_fragment = True
                        print(f"[Docling] Removing OCR fragment (heuristic): '{line}'", file=sys.stderr)

        if not is_fragment:
            cleaned_lines.append(lines[i])

        i += 1

    # Clean up excessive blank lines (more than 2 consecutive)
    result = '\n'.join(cleaned_lines)
    result = re.sub(r'\n{4,}', '\n\n\n', result)

    return result


def convert_with_vlm(file_path: str, output_dir: str) -> dict:
    """
    Convert document to markdown using Docling's VLM pipeline with granite-docling model.
    This provides enhanced equation recognition and proper LaTeX conversion.

    Args:
        file_path: Path to the document file
        output_dir: Directory to save extracted images

    Returns:
        Dictionary with markdown content, title, images, and figure captions
    """
    from docling.document_converter import DocumentConverter, PdfFormatOption
    from docling.datamodel.base_models import InputFormat
    from docling.pipeline.vlm_pipeline import VlmPipeline
    from docling_core.types.doc.base import ImageRefMode

    os.makedirs(output_dir, exist_ok=True)

    print(f"[Docling VLM] Converting with enhanced equation recognition: {file_path}", file=sys.stderr)
    print(f"[Docling VLM] Using granite-docling model (this may take a while on first run)...", file=sys.stderr)

    # Create converter with VLM pipeline for better math/equation handling
    converter = DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(
                pipeline_cls=VlmPipeline,
            ),
        }
    )

    # Convert the document
    result = converter.convert(file_path)
    doc = result.document

    # Extract images
    images = []
    if hasattr(doc, 'pictures') and doc.pictures:
        print(f"[Docling VLM] Extracting {len(doc.pictures)} pictures...", file=sys.stderr)

        for idx, picture in enumerate(doc.pictures):
            try:
                if hasattr(picture, 'image') and picture.image is not None:
                    pil_image = picture.image.pil_image
                    if pil_image:
                        image_filename = f"figure_{idx + 1}.png"
                        image_path = os.path.join(output_dir, image_filename)
                        pil_image.save(image_path, 'PNG', optimize=True)

                        page_num = 1
                        bbox = None
                        caption = ""
                        figure_number = ""

                        if hasattr(picture, 'prov') and picture.prov:
                            prov = picture.prov[0] if isinstance(picture.prov, list) else picture.prov
                            if hasattr(prov, 'page_no'):
                                page_num = prov.page_no
                            if hasattr(prov, 'bbox'):
                                b = prov.bbox
                                bbox = {
                                    "x": b.l, "y": b.t,
                                    "width": b.r - b.l, "height": b.b - b.t
                                }

                        if hasattr(picture, 'caption') and picture.caption:
                            caption = str(picture.caption)
                            fig_match = re.search(r'(?:Figure|Fig\.?)\s*([\d.]+)', caption, re.IGNORECASE)
                            if fig_match:
                                figure_number = fig_match.group(1)

                        images.append({
                            "path": image_path,
                            "page": page_num,
                            "index": idx,
                            "alt": caption or f"Figure {idx + 1}",
                            "caption": caption,
                            "figureNumber": figure_number,
                            "type": "figure",
                            "bbox": bbox
                        })
            except Exception as e:
                print(f"[Docling VLM] Failed to save picture {idx}: {e}", file=sys.stderr)

    # Export markdown with embedded images
    print(f"[Docling VLM] Exporting markdown with LaTeX equations...", file=sys.stderr)
    markdown_content = doc.export_to_markdown(
        image_mode=ImageRefMode.EMBEDDED
    )

    # Build figure captions
    figure_captions = {}
    for img in images:
        if img.get("figureNumber") and img.get("caption"):
            figure_captions[img["figureNumber"]] = img["caption"]

    additional_captions = extract_figure_captions(markdown_content)
    for fig_num, caption in additional_captions.items():
        if fig_num not in figure_captions:
            figure_captions[fig_num] = caption

    page_count = len(doc.pages) if hasattr(doc, 'pages') else None

    print(f"[Docling VLM] Done. {len(images)} images, {len(figure_captions)} captions", file=sys.stderr)

    return {
        "markdown": markdown_content,
        "title": extract_title(markdown_content, file_path),
        "images": images,
        "figureCaptions": figure_captions,
        "pageCount": page_count
    }


def convert_with_docling(file_path: str, output_dir: str) -> dict:
    """
    Convert document to markdown using Docling with image extraction.
    Uses the standard PDF pipeline (faster but less accurate for equations).

    Args:
        file_path: Path to the document file
        output_dir: Directory to save extracted images

    Returns:
        Dictionary with markdown content, title, images, and figure captions
    """
    from docling.document_converter import DocumentConverter
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.document_converter import PdfFormatOption
    from docling_core.types.doc.base import ImageRefMode

    os.makedirs(output_dir, exist_ok=True)

    # Configure pipeline for optimal image extraction
    pipeline_options = PdfPipelineOptions()
    pipeline_options.do_ocr = True  # Enable OCR for scanned pages
    pipeline_options.do_table_structure = True  # Enable table detection
    pipeline_options.images_scale = 2.0  # Higher resolution for images
    pipeline_options.generate_picture_images = True  # Extract pictures

    # Create converter with PDF options
    converter = DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
        }
    )

    print(f"[Docling] Converting: {file_path}", file=sys.stderr)

    # Convert the document
    result = converter.convert(file_path)
    doc = result.document

    # First, save all images to the output directory so they can be referenced
    images = []
    image_path_map = {}  # Map from internal ref to saved file path

    if hasattr(doc, 'pictures') and doc.pictures:
        print(f"[Docling] Saving {len(doc.pictures)} pictures to disk...", file=sys.stderr)

        for idx, picture in enumerate(doc.pictures):
            try:
                if hasattr(picture, 'image') and picture.image is not None:
                    pil_image = picture.image.pil_image
                    if pil_image:
                        image_filename = f"figure_{idx + 1}.png"
                        image_path = os.path.join(output_dir, image_filename)
                        pil_image.save(image_path, 'PNG', optimize=True)

                        # Store mapping for later reference
                        if hasattr(picture, 'self_ref'):
                            image_path_map[str(picture.self_ref)] = image_path

                        # Get metadata
                        page_num = 1
                        bbox = None
                        caption = ""
                        figure_number = ""

                        if hasattr(picture, 'prov') and picture.prov:
                            prov = picture.prov[0] if isinstance(picture.prov, list) else picture.prov
                            if hasattr(prov, 'page_no'):
                                page_num = prov.page_no
                            if hasattr(prov, 'bbox'):
                                b = prov.bbox
                                bbox = {
                                    "x": b.l,
                                    "y": b.t,
                                    "width": b.r - b.l,
                                    "height": b.b - b.t
                                }

                        if hasattr(picture, 'caption') and picture.caption:
                            caption = str(picture.caption)
                            fig_match = re.search(r'(?:Figure|Fig\.?)\s*([\d.]+)', caption, re.IGNORECASE)
                            if fig_match:
                                figure_number = fig_match.group(1)

                        images.append({
                            "path": image_path,
                            "page": page_num,
                            "index": idx,
                            "alt": caption or f"Figure {idx + 1}",
                            "caption": caption,
                            "figureNumber": figure_number,
                            "type": "figure",
                            "bbox": bbox
                        })
                        print(f"[Docling] Saved figure {idx + 1} from page {page_num}", file=sys.stderr)
            except Exception as e:
                print(f"[Docling] Failed to save picture {idx}: {e}", file=sys.stderr)

    # Filter out OCR text that falls within picture bounding boxes
    # This removes fragmented text like "Alea Feat", "Input Layer" etc. that was OCR'd from inside figures
    filter_ocr_text_from_figures(doc, images)

    # Extract equations as high-quality images from the PDF
    # This renders equation regions directly from the PDF for perfect visual fidelity
    equation_images, equation_replacements = extract_equation_images(file_path, doc, output_dir)

    # Add equation images to our images list
    images.extend(equation_images)

    # Export markdown with EMBEDDED mode - images will be inline as base64 at their correct positions
    # This inserts ![caption](data:image/png;base64,...) at the correct locations in the markdown
    # The frontend will then extract these and convert to surf:// URLs
    print(f"[Docling] Exporting markdown with embedded base64 images...", file=sys.stderr)
    markdown_content = doc.export_to_markdown(
        image_mode=ImageRefMode.EMBEDDED
    )

    # Replace garbled formula text with equation images
    # This substitutes OCR'd equation text (often corrupted) with crisp images
    markdown_content = replace_formula_text_with_images(markdown_content, doc, equation_replacements)

    # Post-process markdown to remove any remaining OCR fragments
    # This is a fallback for when document model filtering doesn't catch everything
    markdown_content = clean_markdown_ocr_fragments(markdown_content)

    # Build figure captions dict from images we collected
    figure_captions = {}
    for img in images:
        if img.get("figureNumber") and img.get("caption"):
            figure_captions[img["figureNumber"]] = img["caption"]

    # Extract additional figure captions from markdown
    additional_captions = extract_figure_captions(markdown_content)
    for fig_num, caption in additional_captions.items():
        if fig_num not in figure_captions:
            figure_captions[fig_num] = caption

    # Get page count
    page_count = len(doc.pages) if hasattr(doc, 'pages') else None

    print(f"[Docling] Extracted {len(images)} images, {len(figure_captions)} captions", file=sys.stderr)

    return {
        "markdown": markdown_content,
        "title": extract_title(markdown_content, file_path),
        "images": images,
        "figureCaptions": figure_captions,
        "pageCount": page_count
    }


def extract_figure_captions(markdown: str) -> dict:
    """
    Extract figure captions from markdown content.

    Looks for patterns like:
    - "FIGURE 1.2 Description..."
    - "Figure 1: Description..."
    - "Fig. 3.1: Description..."

    Returns:
        Dict mapping figure number to caption text
    """
    captions = {}

    patterns = [
        r'(?:FIGURE|Figure)\s+([\d.]+)[:\s]+([^\n]+)',
        r'(?:Fig\.?)\s+([\d.]+)[:\s]+([^\n]+)',
        r'\*\*(?:Figure|FIGURE)\s+([\d.]+)\*\*[:\s]+([^\n]+)',
    ]

    for pattern in patterns:
        for match in re.finditer(pattern, markdown):
            fig_num = match.group(1)
            caption = match.group(2).strip()
            if fig_num not in captions:
                captions[fig_num] = caption

    return captions


def extract_title(markdown: str, file_path: str) -> str:
    """
    Extract title from first H1 heading, or fall back to filename.
    """
    for line in markdown.split('\n'):
        line = line.strip()
        if line.startswith('# '):
            return line[2:].strip()

    return Path(file_path).stem


def fallback_to_markitdown(file_path: str, output_dir: str) -> dict:
    """
    Fallback to MarkItDown if Docling fails or isn't available.
    """
    print("[Docling] Falling back to MarkItDown...", file=sys.stderr)

    from markitdown import MarkItDown

    md = MarkItDown()
    result = md.convert(file_path)
    markdown_content = result.text_content

    # Extract figure captions
    figure_captions = extract_figure_captions(markdown_content)

    # For PDFs, try to extract images using pdf2image
    images = []
    ext = Path(file_path).suffix.lower()
    if ext == '.pdf':
        images = extract_pdf_images_fallback(file_path, output_dir, figure_captions)

    return {
        "markdown": markdown_content,
        "title": extract_title(markdown_content, file_path),
        "images": images,
        "figureCaptions": figure_captions,
        "pageCount": None
    }


def extract_pdf_images_fallback(file_path: str, output_dir: str, figure_captions: dict) -> list:
    """
    Fallback image extraction using pdf2image (renders pages as images).
    """
    images = []

    try:
        from pdf2image import convert_from_path

        os.makedirs(output_dir, exist_ok=True)

        # Detect which pages likely have figures
        figure_pages = detect_figure_pages(figure_captions)

        if figure_pages:
            print(f"[Fallback] Extracting figures from pages: {figure_pages}", file=sys.stderr)
            for page_num in figure_pages:
                try:
                    page_images = convert_from_path(
                        file_path,
                        dpi=200,
                        first_page=page_num,
                        last_page=page_num,
                        fmt='png'
                    )

                    if page_images:
                        image_filename = f"figure_page_{page_num}.png"
                        image_path = os.path.join(output_dir, image_filename)
                        page_images[0].save(image_path, 'PNG', optimize=True)

                        images.append({
                            "path": image_path,
                            "page": page_num,
                            "index": len(images),
                            "alt": f"Figure from page {page_num}",
                            "type": "figure"
                        })
                except Exception as e:
                    print(f"[Fallback] Failed to extract page {page_num}: {e}", file=sys.stderr)
        else:
            # No specific figure pages detected - extract first few pages as sample
            print("[Fallback] No figure pages detected, extracting sample pages", file=sys.stderr)

    except ImportError:
        print("[Fallback] pdf2image not available", file=sys.stderr)
    except Exception as e:
        print(f"[Fallback] Image extraction failed: {e}", file=sys.stderr)

    return images


def detect_figure_pages(figure_captions: dict) -> list:
    """
    Estimate which pages contain figures based on figure numbers.

    This is a heuristic - assumes figures are numbered sequentially
    and roughly distributed through the document.
    """
    if not figure_captions:
        return []

    # Extract figure numbers and estimate pages
    # This is a rough heuristic - actual page detection happens in Docling
    pages = set()

    for fig_num in figure_captions.keys():
        try:
            # Try to parse the first number as a rough page indicator
            parts = fig_num.split('.')
            chapter = int(parts[0])
            # Assume each chapter is roughly 10-15 pages
            estimated_page = (chapter - 1) * 12 + 1
            pages.add(estimated_page)
            pages.add(estimated_page + 5)  # Add a second page for safety
        except (ValueError, IndexError):
            pass

    return sorted(list(pages))[:20]  # Limit to 20 pages max


def main():
    """Main entry point for the converter script."""
    parser = argparse.ArgumentParser(
        description="Convert documents to markdown using Docling (AI-powered)"
    )
    parser.add_argument(
        "file_path",
        help="Path to the document to convert (PDF, EPUB, DOCX, PPTX)"
    )
    parser.add_argument(
        "--output-dir", "-o",
        help="Directory to save extracted images (default: temp directory)"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose output to stderr"
    )
    parser.add_argument(
        "--vlm",
        action="store_true",
        help="Use VLM pipeline with granite-docling for enhanced equation recognition"
    )
    parser.add_argument(
        "--fallback",
        action="store_true",
        help="Use MarkItDown as fallback if Docling fails"
    )
    args = parser.parse_args()

    # Validate file exists
    if not Path(args.file_path).exists():
        print(json.dumps({
            "error": f"File not found: {args.file_path}"
        }))
        sys.exit(1)

    # Set up output directory for images
    if args.output_dir:
        output_dir = args.output_dir
    else:
        output_dir = tempfile.mkdtemp(prefix="docling_images_")

    try:
        if args.verbose:
            print(f"[Docling] Converting: {args.file_path}", file=sys.stderr)
            print(f"[Docling] Image output dir: {output_dir}", file=sys.stderr)
            if args.vlm:
                print(f"[Docling] VLM mode enabled for enhanced equation recognition", file=sys.stderr)

        # Try VLM pipeline first if requested (better for documents with equations)
        if args.vlm:
            try:
                result = convert_with_vlm(args.file_path, output_dir)
            except ImportError as e:
                print(f"[Docling VLM] Not available ({e}), falling back to standard pipeline", file=sys.stderr)
                result = convert_with_docling(args.file_path, output_dir)
            except Exception as e:
                print(f"[Docling VLM] Failed ({e}), falling back to standard pipeline", file=sys.stderr)
                result = convert_with_docling(args.file_path, output_dir)
        else:
            # Use standard Docling pipeline
            try:
                result = convert_with_docling(args.file_path, output_dir)
            except ImportError as e:
                if args.fallback:
                    print(f"[Docling] Not available ({e}), using fallback", file=sys.stderr)
                    result = fallback_to_markitdown(args.file_path, output_dir)
                else:
                    raise
            except Exception as e:
                if args.fallback:
                    print(f"[Docling] Conversion failed ({e}), using fallback", file=sys.stderr)
                    result = fallback_to_markitdown(args.file_path, output_dir)
                else:
                    raise

        if args.verbose:
            print(f"[Docling] Conversion complete. Markdown length: {len(result['markdown'])}", file=sys.stderr)
            print(f"[Docling] Found {len(result['images'])} images", file=sys.stderr)
            print(f"[Docling] Found {len(result['figureCaptions'])} figure captions", file=sys.stderr)

        # Output JSON to stdout
        print(json.dumps(result))

    except Exception as e:
        error_msg = str(e)
        if args.verbose:
            import traceback
            traceback.print_exc(file=sys.stderr)

        print(json.dumps({
            "error": error_msg
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()
