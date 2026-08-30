export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'amirnet-theme';

/** Dark is the product's identity; light exists for reading outdoors. */
export const DEFAULT_THEME: Theme = 'dark';

/** Matches the ground colour of each theme, for the iOS status bar. */
const THEME_COLOR: Record<Theme, string> = {
  dark: '#0d1117',
  light: '#f5f6f8',
};

function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light';
}

/**
 * Reads the stored preference.
 *
 * Storage access itself throws in a private window and in some embedded
 * viewers, so this never lets a failed read take the app down with it — a
 * missing preference is simply the default, which is what a first-time
 * visitor gets anyway.
 */
export function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/**
 * Applies the theme to the document and remembers it.
 *
 * The dark palette lives on bare `:root`, so dark is expressed by the
 * *absence* of the attribute rather than by `data-theme="dark"`. That keeps
 * the default reachable even before this ever runs — a boot that fails
 * before hydration still renders in the product's own colours instead of
 * unstyled white.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'light') {
    root.setAttribute('data-theme', 'light');
  } else {
    root.removeAttribute('data-theme');
  }

  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);

  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // A preference that cannot be persisted still applies for this session.
  }
}
