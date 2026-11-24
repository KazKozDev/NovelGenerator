/**
 * Art Director: Computer-vision and design heuristics for automatic
 * cover composition, focal point detection, and typography color harmony.
 */

export interface ImageCompositionAnalysis {
  brightness: number; // 0 (black) to 255 (white)
  contrast: number; // standard deviation of luminance
  isDark: boolean;
  recommendedTextColor: string;
  saliency: {
    leftDensity: number;
    centerDensity: number;
    rightDensity: number;
    focalPoint: { x: number; y: number };
    recommendedLayout: 'editorial_left' | 'classic';
  };
  palette: {
    dominant: string;
    accent: string;
    badgeColor: string;
    badgeTextColor: string;
  };
}

export interface RecommendedCoverStyle {
  youtubeLayout: 'editorial_left' | 'classic';
  focus: { x: number; y: number };
  color: string;
  badgeColor: string;
  badgeTextColor: string;
  badge: string;
  shade: number;
  uppercase: boolean;
  reason: string;
}

/**
 * Converts RGB to HSL.
 * H: [0, 360], S: [0, 1], L: [0, 1]
 */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
  }
  return [h, s, l];
}

/**
 * Converts HSL to hex string #rrggbb.
 */
function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;

  if (h >= 0 && h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h >= 60 && h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h >= 180 && h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h >= 240 && h < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }

  const toHex = (n: number) => {
    const hex = Math.round((n + m) * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Fast client-side analysis of the master cover image:
 * analyzes luminance, edge saliency (focus/subject positioning),
 * and extracts accent colors.
 */
export function analyzeCoverImage(
  source: CanvasImageSource,
  sourceWidth?: number,
  sourceHeight?: number
): ImageCompositionAnalysis {
  // Safe defaults if analysis cannot run (e.g. cross-origin or headless without canvas 2d)
  const fallback: ImageCompositionAnalysis = {
    brightness: 65,
    contrast: 40,
    isDark: true,
    recommendedTextColor: '#fdfbf7',
    saliency: {
      leftDensity: 20,
      centerDensity: 35,
      rightDensity: 65,
      focalPoint: { x: 0.68, y: 0.58 },
      recommendedLayout: 'editorial_left',
    },
    palette: {
      dominant: '#18181b',
      accent: '#e5a93c',
      badgeColor: '#e5a93c',
      badgeTextColor: '#18181b',
    },
  };

  try {
    if (typeof document === 'undefined') return fallback;

    const W = 160;
    const H = 90;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return fallback;

    ctx.drawImage(source, 0, 0, W, H);
    const imgData = ctx.getImageData(0, 0, W, H);
    const data = imgData.data;

    let totalLuminance = 0;
    const luminances = new Float32Array(W * H);

    // 1. Luminance & Color Histogram
    const colorBuckets: Array<{ h: number; s: number; l: number; weight: number }> = [];

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Relative luminance (standard sRGB)
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const pixelIdx = i / 4;
      luminances[pixelIdx] = lum;
      totalLuminance += lum;

      const [h, s, l] = rgbToHsl(r, g, b);
      // Collect saturated colors that make striking badges (exclude washed out / pure grays)
      if (s > 0.28 && l > 0.22 && l < 0.82) {
        // Boost warm and amber hues (typical for cinematic editorial palettes)
        const warmthBonus = (h >= 25 && h <= 55) ? 1.6 : (h >= 345 || h <= 20) ? 1.3 : 1.0;
        colorBuckets.push({ h, s, l, weight: s * warmthBonus });
      }
    }

    const avgLuminance = totalLuminance / (W * H);
    const isDark = avgLuminance < 145;

    // 2. Sobel Edge Detection / Saliency Density
    let leftEdges = 0;
    let centerEdges = 0;
    let rightEdges = 0;
    let weightedX = 0;
    let weightedY = 0;
    let totalEdgeWeight = 0;

    const leftBoundary = Math.round(W * 0.38);
    const rightBoundary = Math.round(W * 0.62);

    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const idx = y * W + x;
        // Simple discrete gradient magnitude
        const gx = luminances[idx + 1] - luminances[idx - 1];
        const gy = luminances[idx + W] - luminances[idx - W];
        const mag = Math.abs(gx) + Math.abs(gy);

        if (mag > 18) {
          totalEdgeWeight += mag;
          weightedX += x * mag;
          weightedY += y * mag;

          if (x < leftBoundary) leftEdges += mag;
          else if (x > rightBoundary) rightEdges += mag;
          else centerEdges += mag;
        }
      }
    }

    const focalX = totalEdgeWeight > 0 ? weightedX / (totalEdgeWeight * W) : 0.5;
    const focalY = totalEdgeWeight > 0 ? weightedY / (totalEdgeWeight * H) : 0.5;

    // Saliency layout decision:
    // If the right side has high edge activity (hand, item, focal figure) and left is calmer,
    // editorial_left is the ideal magazine layout.
    const recommendedLayout: 'editorial_left' | 'classic' =
      rightEdges > leftEdges * 1.2 || focalX > 0.54 ? 'editorial_left' : 'classic';

    // 3. Best Accent Selection
    let bestAccent = '#e5a93c'; // fallback warm amber
    if (colorBuckets.length > 0) {
      colorBuckets.sort((a, b) => b.weight - a.weight);
      // Pick top candidate
      const top = colorBuckets[0];
      // Normalize saturation and lightness for clean UI badge contrast
      const badgeS = Math.min(0.85, Math.max(0.65, top.s));
      const badgeL = Math.min(0.58, Math.max(0.48, top.l));
      bestAccent = hslToHex(top.h, badgeS, badgeL);
    }

    const [badgeH, badgeS, badgeL] = rgbToHsl(
      parseInt(bestAccent.slice(1, 3), 16),
      parseInt(bestAccent.slice(3, 5), 16),
      parseInt(bestAccent.slice(5, 7), 16)
    );
    const badgeTextColor = badgeL > 0.55 ? '#18181b' : '#ffffff';

    return {
      brightness: Math.round(avgLuminance),
      contrast: 40,
      isDark,
      recommendedTextColor: isDark ? '#fdfbf7' : '#18181b',
      saliency: {
        leftDensity: Math.round(leftEdges),
        centerDensity: Math.round(centerEdges),
        rightDensity: Math.round(rightEdges),
        focalPoint: {
          x: Math.min(0.85, Math.max(0.15, Number(focalX.toFixed(2)))),
          y: Math.min(0.85, Math.max(0.15, Number(focalY.toFixed(2)))),
        },
        recommendedLayout,
      },
      palette: {
        dominant: isDark ? '#18181b' : '#f4f4f5',
        accent: bestAccent,
        badgeColor: bestAccent,
        badgeTextColor,
      },
    };
  } catch {
    return fallback;
  }
}

/**
 * Produces full cover styling recommendations based on image analysis
 * and book metadata.
 */
export function recommendCoverStyling(
  analysis: ImageCompositionAnalysis,
  text: { title: string; genre?: string; author?: string }
): RecommendedCoverStyle {
  const genreLower = (text.genre || '').toLowerCase();
  let badge = 'FULL AUDIOBOOK';

  if (genreLower.includes('thriller') || genreLower.includes('триллер')) {
    badge = 'THRILLER AUDIOBOOK';
  } else if (genreLower.includes('detective') || genreLower.includes('детектив')) {
    badge = 'CRIME & MYSTERY';
  } else if (genreLower.includes('romance') || genreLower.includes('любовн')) {
    badge = 'AUDIO NOVEL';
  } else if (genreLower.includes('fantasy') || genreLower.includes('фэнтези')) {
    badge = 'EPIC AUDIOBOOK';
  }

  const isLeftWeighted = analysis.saliency.recommendedLayout === 'editorial_left';

  return {
    youtubeLayout: analysis.saliency.recommendedLayout,
    focus: analysis.saliency.focalPoint,
    color: analysis.recommendedTextColor,
    badgeColor: analysis.palette.badgeColor,
    badgeTextColor: analysis.palette.badgeTextColor,
    badge,
    shade: analysis.isDark ? 0.35 : 0.6,
    uppercase: true,
    reason: isLeftWeighted
      ? `Detected focal subject on right (x: ${Math.round(analysis.saliency.focalPoint.x * 100)}%). Applied Editorial Left layout with extracted ${analysis.palette.badgeColor} badge.`
      : `Detected centered composition. Balanced typography with high-contrast text.`,
  };
}
