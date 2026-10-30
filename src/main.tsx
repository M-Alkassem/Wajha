import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts';
import './index.css';
import App from './App';
import { trackInputModality } from './ui/kit';

// Before the first render: focus rings and tooltips follow the last input (see modality.ts).
trackInputModality();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
