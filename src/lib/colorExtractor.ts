// Utility to extract vibrant colors from album artwork for dynamic ambient background color grading

export interface AmbientPalette {
  primary: string; // e.g. "rgb(180, 50, 120)"
  secondary: string; // e.g. "rgb(70, 130, 240)"
  glow1: string; // e.g. "rgba(180, 50, 120, 0.55)"
  glow2: string; // e.g. "rgba(70, 130, 240, 0.40)"
  darkBg: string; // e.g. "rgb(15, 12, 22)"
}

const PRESET_PALETTES: [ [number, number, number], [number, number, number] ][] = [
  [[138, 43, 226], [255, 64, 129]], // Violet / Pink
  [[233, 30, 99], [255, 152, 0]],   // Pink / Orange
  [[0, 180, 216], [114, 9, 183]],   // Cyan / Purple
  [[16, 185, 129], [6, 95, 70]],    // Emerald / Forest
  [[245, 158, 11], [220, 38, 38]],  // Amber / Crimson
  [[59, 130, 246], [147, 51, 234]], // Royal Blue / Indigo
  [[236, 72, 153], [99, 102, 241]], // Rose / Indigo
  [[20, 184, 166], [59, 130, 246]], // Teal / Blue
  [[168, 85, 247], [236, 72, 153]], // Purple / Pink
  [[244, 63, 94], [251, 146, 60]],  // Rose / Coral
];

function hashStringToPalette(seed: string): [ [number, number, number], [number, number, number] ] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % PRESET_PALETTES.length;
  return PRESET_PALETTES[index];
}

function buildPaletteFromRgb(
  rgb1: [number, number, number],
  rgb2: [number, number, number]
): AmbientPalette {
  const [r1, g1, b1] = rgb1;
  const [r2, g2, b2] = rgb2;

  // Dark base background derived from the primary color
  const darkR = Math.max(8, Math.min(22, Math.round(r1 * 0.1)));
  const darkG = Math.max(8, Math.min(22, Math.round(g1 * 0.1)));
  const darkB = Math.max(10, Math.min(26, Math.round(b1 * 0.12)));

  return {
    primary: `rgb(${r1}, ${g1}, ${b1})`,
    secondary: `rgb(${r2}, ${g2}, ${b2})`,
    glow1: `rgba(${r1}, ${g1}, ${b1}, 0.55)`,
    glow2: `rgba(${r2}, ${g2}, ${b2}, 0.40)`,
    darkBg: `rgb(${darkR}, ${darkG}, ${darkB})`,
  };
}

export function getFallbackPalette(seed = 'imusic'): AmbientPalette {
  const [c1, c2] = hashStringToPalette(seed);
  return buildPaletteFromRgb(c1, c2);
}

// In-memory cache to avoid recomputing pixels for the same image URL
const colorCache = new Map<string, AmbientPalette>();

export async function extractAmbientColors(
  imageUrl: string,
  seed = 'imusic'
): Promise<AmbientPalette> {
  if (colorCache.has(imageUrl)) {
    return colorCache.get(imageUrl)!;
  }

  if (typeof window === 'undefined') {
    return getFallbackPalette(seed);
  }

  return new Promise<AmbientPalette>((resolve) => {
    const fallback = getFallbackPalette(seed);
    const img = new window.Image();
    img.crossOrigin = 'anonymous';

    let resolved = false;
    const safeResolve = (palette: AmbientPalette) => {
      if (!resolved) {
        resolved = true;
        colorCache.set(imageUrl, palette);
        resolve(palette);
      }
    };

    const timeout = setTimeout(() => {
      safeResolve(fallback);
    }, 1500);

    img.onload = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          safeResolve(fallback);
          return;
        }

        const size = 32;
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(img, 0, 0, size, size);

        const imgData = ctx.getImageData(0, 0, size, size).data;
        const colorCounts: { [key: string]: { rgb: [number, number, number]; count: number; score: number } } = {};

        for (let i = 0; i < imgData.length; i += 4) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];
          const a = imgData[i + 3];

          if (a < 128) continue;

          // Compute perceived luminance
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          // Filter out pure black / very dark and pure white / very washed out
          if (lum < 25 || lum > 235) continue;

          // Compute saturation approximation
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const sat = max === 0 ? 0 : (max - min) / max;

          // Quantize color into buckets
          const qR = Math.round(r / 24) * 24;
          const qG = Math.round(g / 24) * 24;
          const qB = Math.round(b / 24) * 24;
          const key = `${qR},${qG},${qB}`;

          // Score colors higher if they have strong saturation and mid luminance
          const vibranceScore = sat * 2.0 * (1 - Math.abs(lum - 128) / 128);

          if (!colorCounts[key]) {
            colorCounts[key] = { rgb: [qR, qG, qB], count: 1, score: vibranceScore };
          } else {
            colorCounts[key].count += 1;
            colorCounts[key].score += vibranceScore;
          }
        }

        const sorted = Object.values(colorCounts).sort((a, b) => b.score - a.score);

        if (sorted.length === 0) {
          safeResolve(fallback);
          return;
        }

        const primaryRgb = sorted[0].rgb;
        let secondaryRgb = sorted[1]?.rgb;

        // Ensure secondary is distinct from primary
        if (!secondaryRgb || (
          Math.abs(primaryRgb[0] - secondaryRgb[0]) < 30 &&
          Math.abs(primaryRgb[1] - secondaryRgb[1]) < 30 &&
          Math.abs(primaryRgb[2] - secondaryRgb[2]) < 30
        )) {
          // Complement or shift hue
          secondaryRgb = [
            (primaryRgb[1] + 60) % 255,
            (primaryRgb[2] + 40) % 255,
            (primaryRgb[0] + 80) % 255,
          ];
        }

        const palette = buildPaletteFromRgb(primaryRgb, secondaryRgb);
        safeResolve(palette);
      } catch {
        // Tainted canvas or CORS error -> use deterministic fallback palette
        safeResolve(fallback);
      }
    };

    img.onerror = () => {
      clearTimeout(timeout);
      safeResolve(fallback);
    };

    img.src = imageUrl;
  });
}
