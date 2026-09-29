import { BadgetripProvider } from '@walangstudio/badgetrip-react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { engine } from './engine.js';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');

createRoot(root).render(
  <StrictMode>
    <BadgetripProvider engine={engine}>
      <App />
    </BadgetripProvider>
  </StrictMode>,
);
