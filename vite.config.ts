import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative rather than absolute, and relative rather than a hardcoded
  // '/repo-name/'. GitHub Pages serves a project site from a subpath, so
  // absolute '/assets/...' URLs would 404. './' resolves against wherever
  // index.html actually sits, which makes the same build work unchanged at
  // a domain root, under a subpath, and from the local dist folder.
  base: './',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});
