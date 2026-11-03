import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Les variables VITE_* (ex. VITE_MOCK) se règlent dans le .env à la racine du dépôt.
  envDir: '..',
  // Le moteur de règles (workflows/code/sgb6) et les données fictives (data/sgb6) sont hors du dossier front.
  server: { port: 5173, fs: { allow: ['..'] } },
});
