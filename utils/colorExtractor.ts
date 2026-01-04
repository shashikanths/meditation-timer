/**
 * Color Extractor - Extract dominant colors from images
 * Uses canvas to sample pixels and find the most vibrant/dominant color
 */

interface RGB {
  r: number;
  g: number;
  b: number;
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
          if (brightness < 30 || brightness > 225) continue;

          // Calculate color vibrancy (saturation-like metric)
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const vibrancy = max - min;

          // Skip gray/desaturated colors
          if (vibrancy < 30) continue;

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
          const palette = generatePalette(bestColor);
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
  const primary = rgbToHex(rgb);
  const primaryDark = rgbToHex(darken(rgb, 0.2));
  const primaryLight = rgbToHex(lighten(rgb, 0.3));

  return { primary, primaryDark, primaryLight };
}

function rgbToHex(rgb: RGB): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

function darken(rgb: RGB, amount: number): RGB {
  return {
    r: rgb.r * (1 - amount),
    g: rgb.g * (1 - amount),
    b: rgb.b * (1 - amount)
  };
}

function lighten(rgb: RGB, amount: number): RGB {
  return {
    r: rgb.r + (255 - rgb.r) * amount,
    g: rgb.g + (255 - rgb.g) * amount,
    b: rgb.b + (255 - rgb.b) * amount
  };
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
