import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');

createRoot(container).render(
  <StrictMode>
    {/* Last-resort net for anything outside the grid/panel's own boundaries
        (e.g. App.tsx's own render logic) — those two are scoped narrower so
        a crash there doesn't take out the header/filters along with it. */}
    <ErrorBoundary label="MediaVault">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
