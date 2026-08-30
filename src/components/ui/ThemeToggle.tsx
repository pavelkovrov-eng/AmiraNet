import { useState } from 'react';
import { applyTheme, readStoredTheme, type Theme } from '../../lib/theme';

/**
 * Switches between the dark instrument palette and the daylight one.
 *
 * Dark is the default and the product's identity. This exists for the one
 * case the dark direction genuinely handles badly: reading a phone screen
 * outdoors in direct sun.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme());

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  }

  const label = theme === 'dark' ? 'עבור לתצוגה בהירה' : 'עבור לתצוגה כהה';

  return (
    <button type="button" className="theme-toggle" onClick={toggle} aria-label={label} title={label}>
      <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
    </button>
  );
}
