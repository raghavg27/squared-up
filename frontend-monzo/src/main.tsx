import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import { App } from './App.js';
import { StoreProvider } from './store.js';
import { ToastProvider } from './toast.js';
import { ErrorBoundary, OfflineBanner } from './ErrorBoundary.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <StoreProvider>
          <ToastProvider>
            <OfflineBanner />
            <App />
          </ToastProvider>
        </StoreProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
