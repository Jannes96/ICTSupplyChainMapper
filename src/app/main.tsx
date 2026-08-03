import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { ChainWindow, parseChainWindowHash } from './ChainWindow.tsx';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

// Two entry points behind one bundle: the tool itself, and the standalone chain
// window opened from it. Which one runs is decided by the hash, so the second
// window carries a real URL instead of being a portal into the opener.
const chainWindow = parseChainWindowHash(window.location.hash);

createRoot(container).render(
  <StrictMode>{chainWindow ? <ChainWindow params={chainWindow} /> : <App />}</StrictMode>,
);
