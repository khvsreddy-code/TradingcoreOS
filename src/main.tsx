import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { LevelSettingsDock } from './components/workspace/LevelSettingsDock';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <LevelSettingsDock />
  </StrictMode>,
);
