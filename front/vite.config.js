import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Die VITE_*-Variablen (z. B. VITE_MOCK) werden in der .env im Stammverzeichnis des Repositorys gesetzt.
  envDir: '..',
  // Die Regel-Engine (workflows/code/sgb6) und die fiktiven Daten (data/sgb6) liegen außerhalb des Ordners front.
  server: { port: 5173, fs: { allow: ['..'] } },
});
