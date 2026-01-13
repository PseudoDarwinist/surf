#!/usr/bin/env python3
"""
MarkItDown converter wrapper for Surf app.

This script converts documents (PDF, EPUB, DOCX, PPTX) to markdown using 
Microsoft's MarkItDown library. It also extracts embedded images from PDFs
using pdfminer.six. The output is JSON for easy consumption by the Electron 
main process.

Usage:
    python3 markitdown_converter.py /path/to/document.pdf --output-dir /path/to/images

Output (JSON):
    {
        "markdown": "# Document Title\n\n...",
        "title": "Document Title",
        "images": [{"alt": "Figure 1", "path": "/abs/path/image1.png", "page": 1}, ...],
        "figureCaptions": {"1": "Caption text", "2.1": "Another caption"}
    }
"""

import sys
import json
import re
import os
import argparse
import tempfile
from pathlib import Path


def extract_pdf_images(file_path: str, output_dir: str) -> list:
    """
    Extract images from a PDF file by rendering pages using pdf2image (poppler).
    
    This approach renders each PDF page as an image, which captures:
    - Vector graphics (diagrams, charts, flowcharts)
    - Embedded raster images
    - Any visual content on the page
    
    We use a heuristic to detect pages that likely contain figures based on
    the markdown content (looking for "Fig." or "Figure" patterns).
    
    Args:
        file_path: Path to the PDF file
        output_dir: Directory to save extracted images
        
    Returns:
        List of dictionaries with image info (path, page, index)
    """
    images = []
    
    try:
        from pdf2image import convert_from_path
        from PIL import Image
        
        os.makedirs(output_dir, exist_ok=True)
        
        # Convert PDF pages to images (lower DPI for reasonable file size)
        # We render all pages but only save those that are likely to contain figures
        print(f"Converting PDF pages to images...", file=sys.stderr)
        pages = convert_from_path(file_path, dpi=150, fmt='png')
        
        print(f"PDF has {len(pages)} pages", file=sys.stderr)
        
        # For now, save all pages as potential figures
        # The frontend can decide which to display based on figure captions
        for page_num, page_image in enumerate(pages, start=1):
            # Save the page as an image
            image_filename = f"page_{page_num}.png"
            image_path = os.path.join(output_dir, image_filename)
            
            # Optionally crop to remove margins (future enhancement)
            page_image.save(image_path, 'PNG', optimize=True)
            
            images.append({
                "path": image_path,
                "page": page_num,
                "index": page_num - 1,
                "alt": f"Page {page_num}",
                "type": "page_render"
            })
            
        print(f"Saved {len(images)} page images", file=sys.stderr)
        
    except ImportError:
        print("pdf2image not available. Install with: pip install pdf2image", file=sys.stderr)
        print("Also requires poppler: brew install poppler", file=sys.stderr)
    except Exception as e:
        print(f"PDF image extraction failed: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
    
    return images


def extract_figure_regions(file_path: str, output_dir: str, figure_pages: list) -> list:
    """
    Extract specific figure regions from PDF pages.
    
    This is a more targeted approach that only extracts pages known to contain figures.
    
    Args:
        file_path: Path to the PDF file
        output_dir: Directory to save extracted images
        figure_pages: List of page numbers that contain figures
        
    Returns:
        List of dictionaries with image info
    """
    images = []
    
    if not figure_pages:
        return images
    
    try:
        from pdf2image import convert_from_path
        
        os.makedirs(output_dir, exist_ok=True)
        
        # Only convert the pages that contain figures
        for page_num in figure_pages:
            page_images = convert_from_path(
                file_path, 
                dpi=200,  # Higher DPI for figure pages
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
        print(f"Figure extraction failed: {e}", file=sys.stderr)
    
    return images


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
            if fig_num not in captions:  # Don't overwrite
                captions[fig_num] = caption
    
    return captions


def detect_figure_pages(markdown: str, figure_captions: dict) -> list:
    """
    Detect which PDF pages likely contain figures.
    
    This uses a heuristic based on the position of figure references in the markdown.
    For each figure caption, we estimate which page it's on based on its position
    in the text.
    
    Args:
        markdown: The full markdown content
        figure_captions: Dict of figure number -> caption text
        
    Returns:
        List of unique page numbers that likely contain figures
    """
    figure_pages = set()
    
    if not figure_captions:
        # No explicit figure captions - look for inline figure references
        # Match patterns like "Fig. 2", "Figure 3.1", etc.
        fig_refs = re.findall(r'(?:Fig\.?|Figure)\s*[\d.]+', markdown, re.IGNORECASE)
        if fig_refs:
            # If we found figure references but no captions, estimate pages
            # Assume figures are distributed throughout the document
            # For safety, just return page 1 to have at least one image
            return [1]
        return []
    
    # For each figure caption, find its position and estimate the page
    total_length = len(markdown)
    
    for fig_num, caption in figure_captions.items():
        # Try to find the caption in the markdown
        patterns = [
            f"Figure {fig_num}",
            f"Fig. {fig_num}",
            f"FIGURE {fig_num}",
            caption[:30] if len(caption) > 30 else caption
        ]
        
        for pattern in patterns:
            pos = markdown.lower().find(pattern.lower())
            if pos >= 0:
                # Estimate page number based on position
                # Assume ~3000 chars per page (rough estimate)
                estimated_page = max(1, (pos // 3000) + 1)
                figure_pages.add(estimated_page)
                break
    
    return sorted(list(figure_pages))


def convert_document(file_path: str, output_dir: str = None) -> dict:
    """
    Convert document to markdown using MarkItDown.
    
    Args:
        file_path: Path to the document file
        output_dir: Directory to save extracted images (optional)
        
    Returns:
        Dictionary with markdown content, title, images, and figure captions
    """
    from markitdown import MarkItDown
    
    # Basic conversion - no LLM here
    # Image descriptions will be handled by Claude Agent SDK in Electron
    md = MarkItDown()
    result = md.convert(file_path)
    
    # Get the markdown content
    markdown_content = result.text_content
    
    # Extract images referenced in markdown (![alt](path) patterns)
    inline_images = re.findall(r'!\[([^\]]*)\]\(([^)]+)\)', markdown_content)
    images = [{"alt": alt, "path": path, "source": "inline"} for alt, path in inline_images]
    
    # Extract figure captions first - this tells us which pages likely have figures
    figure_captions = extract_figure_captions(markdown_content)
    
    # For PDFs, extract page renders for pages that have figure references
    ext = Path(file_path).suffix.lower()
    if ext == '.pdf' and output_dir:
        # Detect pages with figures based on figure captions
        figure_pages = detect_figure_pages(markdown_content, figure_captions)
        
        if figure_pages:
            print(f"Detected figures on pages: {figure_pages}", file=sys.stderr)
            pdf_images = extract_figure_regions(file_path, output_dir, figure_pages)
            images.extend(pdf_images)
        else:
            print("No specific figure pages detected", file=sys.stderr)
    
    return {
        "markdown": markdown_content,
        "title": extract_title(markdown_content, file_path),
        "images": images,
        "figureCaptions": figure_captions
    }


def extract_title(markdown: str, file_path: str) -> str:
    """
    Extract title from first H1 heading, or fall back to filename.
    """
    for line in markdown.split('\n'):
        line = line.strip()
        if line.startswith('# '):
            return line[2:].strip()
    
    # Fallback to filename without extension
    return Path(file_path).stem


def main():
    """Main entry point for the converter script."""
    parser = argparse.ArgumentParser(
        description="Convert documents to markdown using MarkItDown"
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
    args = parser.parse_args()
    
    # Validate file exists
    if not Path(args.file_path).exists():
        print(json.dumps({
            "error": f"File not found: {args.file_path}"
        }), file=sys.stderr)
        sys.exit(1)
    
    # Set up output directory for images
    if args.output_dir:
        output_dir = args.output_dir
    else:
        # Use temp directory if not specified
        output_dir = tempfile.mkdtemp(prefix="markitdown_images_")
    
    try:
        if args.verbose:
            print(f"Converting: {args.file_path}", file=sys.stderr)
            print(f"Image output dir: {output_dir}", file=sys.stderr)
            
        result = convert_document(args.file_path, output_dir)
        
        if args.verbose:
            print(f"Conversion complete. Markdown length: {len(result['markdown'])}", file=sys.stderr)
            print(f"Found {len(result['images'])} images", file=sys.stderr)
            print(f"Found {len(result['figureCaptions'])} figure captions", file=sys.stderr)
        
        # Output JSON to stdout
        print(json.dumps(result))
        
    except Exception as e:
        error_msg = str(e)
        if args.verbose:
            import traceback
            traceback.print_exc(file=sys.stderr)
        
        print(json.dumps({
            "error": error_msg
        }), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

