import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Registered only in a production build: the dev server serves modules the
// cache-first worker would happily freeze, which makes edits appear not to
// apply.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // BASE_URL, not '/sw.js': under a subpath the worker lives beside
    // index.html, and a worker registered from the domain root would be
    // rejected for being outside its own scope.
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((err) => {
      console.error('Service worker registration failed', err);
    });
  });
}
