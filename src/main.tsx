import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// The service worker is registered inside <UpdatePrompt>, which also surfaces the
// "Update available" banner and the offline-ready toast.

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
