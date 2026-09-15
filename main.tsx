import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './src/App.tsx';
import { LiveTradingTerminal } from './src/LiveTradingTerminal';
import './src/index.css';
import './src/watchlistRenameFix.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <LiveTradingTerminal />
  </StrictMode>,
);
