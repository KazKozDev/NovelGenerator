import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import LiveRunStudio from './components/LiveRunStudio';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {new URLSearchParams(window.location.search).has('live') ? <LiveRunStudio /> : <App />}
  </React.StrictMode>
);
