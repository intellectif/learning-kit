import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Fixed port so the Playwright e2e suite (Task 19) can target a known URL.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
});
