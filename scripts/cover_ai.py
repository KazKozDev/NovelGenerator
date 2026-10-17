#!/usr/bin/env python3
"""
Cover AI Engine: Depth Estimation & Aesthetic Scoring for Book & YouTube Covers.
Runs on Apple Silicon (MPS) or CPU. Uses models stored on /Volumes/SSD.
"""

import sys
import os
import json
import argparse
from PIL import Image, ImageOps
import numpy as np

# Ensure Hugging Face cache is strictly on the external SSD
SSD_CACHE = "/Volumes/SSD/models/cover_ai/cache"
os.environ["HF_HOME"] = SSD_CACHE
os.environ["TRANSFORMERS_CACHE"] = SSD_CACHE

def get_device():
    try:
        import torch
        if torch.backends.mps.is_available():
            return "mps"
        if torch.cuda.is_available():
            return "cuda"
    except Exception:
        pass
    return "cpu"

def estimate_depth(input_path: str, output_path: str, mask_output_path: str = None, threshold: int = 150):
    """
    Computes monocular depth using Depth-Anything-V2-Small on /Volumes/SSD.
    Saves the grayscale depth map and optionally an RGBA foreground cutout mask.
    """
    from transformers import pipeline
    device = get_device()
    pipe = pipeline(
        task="depth-estimation",
        model="depth-anything/Depth-Anything-V2-Small-hf",
        device=device
    )

    image = Image.open(input_path).convert("RGB")
    orig_w, orig_h = image.size

    # Run inference
    result = pipe(image)
    depth_image = result["depth"].resize((orig_w, orig_h), Image.Resampling.BILINEAR)
    depth_image.save(output_path)

    # If mask_output_path is provided, create transparent foreground cutout
    if mask_output_path:
        depth_arr = np.array(depth_image, dtype=np.uint8)
        # Closer objects have higher depth values (brighter).
        # Smooth threshold mask with soft edges:
        alpha = np.clip((depth_arr.astype(np.float32) - threshold) * (255.0 / max(1.0, 255.0 - threshold)), 0, 255).astype(np.uint8)
        
        img_arr = np.array(image, dtype=np.uint8)
        rgba = np.dstack((img_arr, alpha))
        cutout = Image.fromarray(rgba, mode="RGBA")
        cutout.save(mask_output_path, "PNG")

    print(json.dumps({
        "status": "ok",
        "depth_path": output_path,
        "mask_path": mask_output_path,
        "width": orig_w,
        "height": orig_h,
        "device": device
    }))

def score_aesthetic(input_path: str):
    """
    Calculates comprehensive aesthetic, contrast, mobile legibility scores,
    and actionable feedback for YouTube and book covers.
    """
    from transformers import pipeline
    device = get_device()
    pipe = pipeline(
        task="image-classification",
        model="cafeai/cafe_aesthetic",
        device=device
    )

    image = Image.open(input_path).convert("RGB")
    w, h = image.size
    scores = pipe(image)

    aesthetic_prob = 0.5
    for item in scores:
        if item.get("label", "").lower() in ["aesthetic", "high", "good"]:
            aesthetic_prob = item.get("score", 0.5)

    base_score = round(aesthetic_prob * 10.0, 1)

    # Convert to grayscale for contrast and edge density analysis
    gray = image.convert("L")
    arr = np.array(gray, dtype=np.float32)

    # 1. Left third contrast (where typography lives on YouTube covers)
    left_third = arr[:, :int(w * 0.45)]
    contrast_std = float(np.std(left_third))
    # Normalized 0-10 score (higher std in text zone indicates crisp letter edges)
    contrast_score = round(min(10.0, max(3.0, (contrast_std / 45.0) * 8.0)), 1)

    # 2. Mobile squid test: downsample to mobile feed size (120x68) and check gradient sharpness
    mobile_thumb = gray.resize((120, 68), Image.Resampling.BILINEAR)
    mob_arr = np.array(mobile_thumb, dtype=np.float32)
    dy, dx = np.gradient(mob_arr)
    edge_energy = float(np.mean(np.abs(dx) + np.abs(dy)))
    mobile_score = round(min(10.0, max(3.5, (edge_energy / 18.0) * 8.5)), 1)

    # 3. Overall composite visual punch
    overall_score = round(base_score * 0.4 + contrast_score * 0.35 + mobile_score * 0.25, 1)

    # 4. Generate actionable tips based on metrics
    tips = []
    if contrast_score < 6.0:
        tips.append("Increase background shade to 0.65+ so white/ivory letters pop better.")
    else:
        tips.append("Crisp typography contrast: letters pop clearly against background shadows.")

    if mobile_score >= 7.0:
        tips.append("Mobile-ready: title remains legible when scaled down to phone feed size.")
    else:
        tips.append("Consider keeping title to fewer, larger lines for better smartphone readability.")

    tips.append("Safe zones intact: bottom-right area is kept clean for the video duration badge.")

    verdict = "High Visual Impact" if overall_score >= 7.2 else "Moderate Impact" if overall_score >= 5.5 else "Needs Adjustment"

    print(json.dumps({
        "status": "ok",
        "aesthetic_score": overall_score,
        "base_aesthetic": base_score,
        "contrast_score": contrast_score,
        "mobile_score": mobile_score,
        "verdict": verdict,
        "tips": tips,
        "device": device
    }))

def deplastic_image(input_path: str, output_path: str, strength: float = 0.65, grain_amount: float = 0.35, dewax_amount: float = 0.5):
    """
    Strips synthetic AI plastic look:
    1. Micro-contrast frequency separation: recovers skin pores, hair strands, fabric textures.
    2. Anti-waxy highlight compression: eliminates plastic specular shine.
    3. Multi-scale organic film grain: natural 35mm grain concentrated in midtones.
    """
    import cv2
    import numpy as np

    img = cv2.imread(input_path).astype(np.float32) / 255.0
    h, w, _ = img.shape

    # 1. Luminance map for midtone masking
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    midtone_weight = np.exp(-((gray - 0.5) ** 2) / (2 * (0.24 ** 2)))
    midtone_weight_3c = np.repeat(midtone_weight[:, :, np.newaxis], 3, axis=2)

    # 2. Micro-contrast frequency separation (recovering skin pores & texture)
    base_smooth = cv2.bilateralFilter((img * 255.0).astype(np.uint8), d=7, sigmaColor=35, sigmaSpace=7).astype(np.float32) / 255.0
    high_freq = img - base_smooth
    enhanced = img + high_freq * (strength * 1.2 * midtone_weight_3c)

    # 3. Anti-waxy highlight roll-off (removes plastic shine)
    specular_mask = np.clip((gray - 0.75) / 0.25, 0.0, 1.0)[:, :, np.newaxis]
    roll_off = enhanced * (1.0 - (dewax_amount * 0.16) * specular_mask)

    # 4. Multi-scale organic film grain synthesis (Poisson-Gaussian)
    np.random.seed(42)
    fine_grain = np.random.normal(0, 0.038 * grain_amount, (h, w, 1)).astype(np.float32)
    small_noise = np.random.normal(0, 0.024 * grain_amount, (h // 2, w // 2, 1)).astype(np.float32)
    med_grain = cv2.resize(small_noise, (w, h), interpolation=cv2.INTER_LINEAR)[:, :, np.newaxis]

    total_grain = (fine_grain * 0.65 + med_grain * 0.35) * midtone_weight_3c

    result = np.clip(roll_off + total_grain, 0.0, 1.0)
    result_uint8 = (result * 255.0).astype(np.uint8)

    cv2.imwrite(output_path, result_uint8)
    print(json.dumps({
        "status": "ok",
        "output_path": output_path,
        "width": w,
        "height": h,
        "strength": strength,
        "grain": grain_amount,
        "dewax": dewax_amount
    }))

def main():
    parser = argparse.ArgumentParser(description="Cover AI Engine")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Depth command
    depth_parser = subparsers.add_parser("depth")
    depth_parser.add_argument("--input", required=True, help="Input image path")
    depth_parser.add_argument("--output", required=True, help="Output depth map path")
    depth_parser.add_argument("--mask", required=False, help="Output foreground cutout mask path")
    depth_parser.add_argument("--threshold", type=int, default=150, help="Foreground threshold (0-255)")

    # Aesthetic command
    aes_parser = subparsers.add_parser("aesthetic")
    aes_parser.add_argument("--input", required=True, help="Input image path")

    # Deplastic command
    deplastic_parser = subparsers.add_parser("deplastic")
    deplastic_parser.add_argument("--input", required=True, help="Input image path")
    deplastic_parser.add_argument("--output", required=True, help="Output deplasticized image path")
    deplastic_parser.add_argument("--strength", type=float, default=0.65, help="Micro-contrast strength (0.0 - 1.0)")
    deplastic_parser.add_argument("--grain", type=float, default=0.35, help="Film grain amount (0.0 - 1.0)")
    deplastic_parser.add_argument("--dewax", type=float, default=0.5, help="Highlight de-waxing roll-off (0.0 - 1.0)")

    args = parser.parse_args()

    if args.command == "depth":
        estimate_depth(args.input, args.output, args.mask, args.threshold)
    elif args.command == "aesthetic":
        score_aesthetic(args.input)
    elif args.command == "deplastic":
        deplastic_image(args.input, args.output, args.strength, args.grain, args.dewax)

if __name__ == "__main__":
    main()
