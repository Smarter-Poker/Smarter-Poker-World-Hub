#!/usr/bin/env python3
"""
🎨 Avatar Background Removal Script
Removes backgrounds from all 75 poker avatars for clean table display
Uses rembg library for AI-powered background removal
"""

from rembg import remove
from PIL import Image
import os
from pathlib import Path

# Configuration
INPUT_DIR = Path(__file__).parent.parent / '.gemini' / 'antigravity' / 'brain' / '2998d0c1-93f0-4fe3-bc75-b084014084f0'
OUTPUT_DIR = Path(__file__).parent.parent / 'public' / 'avatars'

def remove_background(input_path, output_path):
    """Remove background from an image using AI"""
    try:
        # Read input image
        with open(input_path, 'rb') as input_file:
            input_data = input_file.read()
        
        # Remove background
        output_data = remove(input_data)
        
        # Save as PNG with transparency
        with open(output_path, 'wb') as output_file:
            output_file.write(output_data)
        
        print(f"✅ Processed: {output_path.name}")
        return True
    except Exception as e:
        print(f"❌ Error processing {input_path.name}: {e}")
        return False

def main():
    print("🎨 Avatar Background Removal Script")
    print("=" * 50)
    
    # Create output directories
    (OUTPUT_DIR / 'free').mkdir(parents=True, exist_ok=True)
    (OUTPUT_DIR / 'vip').mkdir(parents=True, exist_ok=True)
    
    # Get all avatar images
    avatar_files = list(INPUT_DIR.glob('avatar_*.png'))
    
    print(f"\nFound {len(avatar_files)} avatar images")
    print("\nProcessing...")
    
    success_count = 0
    
    for avatar_file in avatar_files:
        # Determine if FREE or VIP
        if 'free' in avatar_file.name or 'clean' in avatar_file.name[:15]:
            tier_dir = OUTPUT_DIR / 'free'
        else:
            tier_dir = OUTPUT_DIR / 'vip'
        
        # Generate clean output filename
        clean_name = avatar_file.name.replace('avatar_', '').replace('_clean', '').replace('vip_', '').replace('free_', '')
        output_path = tier_dir / clean_name
        
        # Remove background
        if remove_background(avatar_file, output_path):
            success_count += 1
    
    print(f"\n✅ Successfully processed {success_count}/{len(avatar_files)} avatars")
    print(f"📁 Output directory: {OUTPUT_DIR}")

if __name__ == '__main__':
    # Check if rembg is installed
    try:
        import rembg
    except ImportError:
        print("❌ rembg library not found!")
        print("📦 Install with: pip install rembg")
        exit(1)
    
    main()
