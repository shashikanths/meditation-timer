/**
 * Color Extractor - Extract dominant colors from images
 * Uses canvas to sample pixels and find the most vibrant/dominant color
 * Ensures good contrast against dark backgrounds
 */

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface HSL {
  h: number;
  s: number;
  l: number;
}

interface ColorPalette {
  primary: string;
  primaryDark: string;
  primaryLight: string;
}

// Default orange palette (fallback)
const DEFAULT_PALETTE: ColorPalette = {
  primary: '#fb923c',
  primaryDark: '#ea580c',
  primaryLight: '#fdba74'
};

// Minimum lightness for good contrast on dark backgrounds
const MIN_LIGHTNESS = 0.5;
const TARGET_LIGHTNESS = 0.6;

/**
 * Convert RGB to HSL
 */
function rgbToHsl(rgb: RGB): HSL {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return { h, s, l };
}

/**
 * Convert HSL to RGB
 */
function hslToRgb(hsl: HSL): RGB {
  const { h, s, l } = hsl;

  if (s === 0) {
    const gray = Math.round(l * 255);
    return { r: gray, g: gray, b: gray };
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
  };
}

/**
 * Ensure a color has sufficient lightness for contrast on dark backgrounds
 */
function ensureContrast(rgb: RGB): RGB {
  const hsl = rgbToHsl(rgb);

  // If the color is too dark, boost its lightness while preserving hue and saturation
  if (hsl.l < MIN_LIGHTNESS) {
    hsl.l = TARGET_LIGHTNESS;
    // Also boost saturation slightly for more vibrant result
    hsl.s = Math.min(1, hsl.s * 1.2);
    return hslToRgb(hsl);
  }

  return rgb;
}

/**
 * Extract dominant color from an image URL
 */
export async function extractColors(imageUrl: string): Promise<ColorPalette> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(DEFAULT_PALETTE);
          return;
        }

        // Sample at a smaller size for performance
        const sampleSize = 100;
        canvas.width = sampleSize;
        canvas.height = sampleSize;

        ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
        const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
        const pixels = imageData.data;

        // Collect colors with their vibrancy scores
        const colorCounts: Map<string, { count: number; rgb: RGB; vibrancy: number }> = new Map();

        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];

          // Skip very dark or very light pixels
          const brightness = (r + g + b) / 3;
          if (brightness < 20 || brightness > 235) continue;

          // Calculate color vibrancy (saturation-like metric)
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const vibrancy = max - min;

          // Skip gray/desaturated colors
          if (vibrancy < 25) continue;

          // Quantize to reduce color space
          const qr = Math.round(r / 32) * 32;
          const qg = Math.round(g / 32) * 32;
          const qb = Math.round(b / 32) * 32;
          const key = `${qr},${qg},${qb}`;

          const existing = colorCounts.get(key);
          if (existing) {
            existing.count++;
            existing.vibrancy = Math.max(existing.vibrancy, vibrancy);
          } else {
            colorCounts.set(key, { count: 1, rgb: { r: qr, g: qg, b: qb }, vibrancy });
          }
        }

        // Find the most vibrant, frequent color
        let bestColor: RGB | null = null;
        let bestScore = 0;

        colorCounts.forEach(({ count, rgb, vibrancy }) => {
          // Score = count * vibrancy (favor both common and vibrant colors)
          const score = count * vibrancy;
          if (score > bestScore) {
            bestScore = score;
            bestColor = rgb;
          }
        });

        if (bestColor) {
          // Ensure the color has good contrast on dark backgrounds
          const adjustedColor = ensureContrast(bestColor);
          const palette = generatePalette(adjustedColor);
          resolve(palette);
        } else {
          resolve(DEFAULT_PALETTE);
        }
      } catch {
        resolve(DEFAULT_PALETTE);
      }
    };

    img.onerror = () => {
      resolve(DEFAULT_PALETTE);
    };

    img.src = imageUrl;
  });
}

/**
 * Generate a color palette from a base color
 */
function generatePalette(rgb: RGB): ColorPalette {
  // Primary should be the contrast-adjusted color
  const primary = rgbToHex(rgb);

  // Dark variant - reduce lightness but keep it visible
  const hsl = rgbToHsl(rgb);
  const darkHsl = { ...hsl, l: Math.max(0.35, hsl.l - 0.15) };
  const primaryDark = rgbToHex(hslToRgb(darkHsl));

  // Light variant - increase lightness
  const lightHsl = { ...hsl, l: Math.min(0.85, hsl.l + 0.15) };
  const primaryLight = rgbToHex(hslToRgb(lightHsl));

  return { primary, primaryDark, primaryLight };
}

function rgbToHex(rgb: RGB): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

/**
 * Apply color palette to CSS variables
 */
export function applyColorPalette(palette: ColorPalette): void {
  document.documentElement.style.setProperty('--color-primary', palette.primary);
  document.documentElement.style.setProperty('--color-primary-dark', palette.primaryDark);
  document.documentElement.style.setProperty('--color-primary-light', palette.primaryLight);
}

/**
 * Get default palette
 */
export function getDefaultPalette(): ColorPalette {
  return DEFAULT_PALETTE;
}
