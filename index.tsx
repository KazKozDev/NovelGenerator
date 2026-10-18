import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { startScreenReport } from './utils/screenReport';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// The agent sees what this screen shows (see docs/MCP.md); only the local dev server takes it.
if (import.meta.env.DEV) startScreenReport();
