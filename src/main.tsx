import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import './index.css';
import { AuthProvider } from './auth/AuthProvider';
import { AccessGate } from './app/AccessGate';
import { ToastProvider } from './components/Toasts';
import { ConfirmProvider } from './components/ConfirmDialog';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <ConfirmProvider>
            <AccessGate />
          </ConfirmProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
