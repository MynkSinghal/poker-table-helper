import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './ui/App';
import { startAwake } from './ui/wakeLock';
import { useStore } from './game/store';
import './styles.css';

registerSW({ immediate: true });
if (useStore.getState().screen === 'game') document.addEventListener('pointerdown', () => startAwake(), { once: true });
document.addEventListener('gesturestart', e => e.preventDefault()); // no pinch-zoom on iOS
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
