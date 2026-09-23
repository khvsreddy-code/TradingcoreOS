import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// TradingCoreOS is an interactive trading terminal. Keep the browser on the
// fast path: avoid React development double-mounts and mark the document so
// the CSS performance layer can remove expensive visual work.
document.documentElement.dataset.tcoFast = '1';

createRoot(document.getElementById('root')!).render(<App />);
