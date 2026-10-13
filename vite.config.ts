import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  // Project pages serve under /<repo>/ — the deploy workflow sets
  // VITE_BASE_PATH accordingly. Local dev/build default to "/".
  base: process.env.VITE_BASE_PATH || "/",
  resolve: {
    alias: {
      // Resolve "~/" imports to the app directory
      '~': path.resolve(__dirname, 'app'),
    },
  },
  // Ensure Vite looks for the entry HTML in the project root
  root: __dirname,
  build: {
    outDir: 'dist',
  },
});
