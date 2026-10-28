export type ThemeId = 'violet' | 'sunset' | 'emerald' | 'ocean' | 'amber';
export type ColorMode = 'dark' | 'light';

export interface ThemeOption {
  id: ThemeId;
  name: string;
  primary: string;
  gradient: string;
  tagline: string;
}

export const THEMES: ThemeOption[] = [
  {
    id: 'violet',
    name: 'Electric Violet',
    primary: '#7c3aed',
    gradient: 'linear-gradient(135deg, #7c3aed, #c026d3)',
    tagline: 'Signature Studio Glow',
  },
  {
    id: 'sunset',
    name: 'Sunset Neon',
    primary: '#f43f5e',
    gradient: 'linear-gradient(135deg, #f43f5e, #fb923c)',
    tagline: 'Warm Coral & Crimson',
  },
  {
    id: 'emerald',
    name: 'Emerald Oasis',
    primary: '#10b981',
    gradient: 'linear-gradient(135deg, #10b981, #06b6d4)',
    tagline: 'Fresh Mint & Forest',
  },
  {
    id: 'ocean',
    name: 'Oceanic Cyan',
    primary: '#0ea5e9',
    gradient: 'linear-gradient(135deg, #0ea5e9, #3b82f6)',
    tagline: 'Azure & Deep Blue',
  },
  {
    id: 'amber',
    name: 'Champagne Gold',
    primary: '#f59e0b',
    gradient: 'linear-gradient(135deg, #f59e0b, #ef4444)',
    tagline: 'Amber & Gold Accent',
  },
];

const THEME_STORAGE_KEY = 'imusic_active_theme';
const COLOR_MODE_STORAGE_KEY = 'imusic_color_mode';

export function getStoredTheme(): ThemeId {
  if (typeof window === 'undefined') return 'violet';
  try {
    const val = localStorage.getItem(THEME_STORAGE_KEY) as ThemeId;
    if (val && THEMES.some((t) => t.id === val)) {
      return val;
    }
  } catch {}
  return 'violet';
}

export function applyTheme(themeId: ThemeId): void {
  if (typeof window === 'undefined') return;
  try {
    document.documentElement.setAttribute('data-theme', themeId);
    localStorage.setItem(THEME_STORAGE_KEY, themeId);
  } catch {}
}

export function getStoredColorMode(): ColorMode {
  if (typeof window === 'undefined') return 'dark';
  try {
    const val = localStorage.getItem(COLOR_MODE_STORAGE_KEY) as ColorMode;
    if (val === 'light' || val === 'dark') {
      return val;
    }
  } catch {}
  return 'dark';
}

export function applyColorMode(mode: ColorMode): void {
  if (typeof window === 'undefined') return;
  try {
    document.documentElement.setAttribute('data-color-mode', mode);
    localStorage.setItem(COLOR_MODE_STORAGE_KEY, mode);
    window.dispatchEvent(new CustomEvent('imusic:color_mode_changed', { detail: { mode } }));
  } catch {}
}

export function toggleColorMode(): ColorMode {
  const current = getStoredColorMode();
  const next: ColorMode = current === 'dark' ? 'light' : 'dark';
  applyColorMode(next);
  return next;
}
