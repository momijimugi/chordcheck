import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppProvider } from './state/AppContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppProvider>
        <App />
      </AppProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
