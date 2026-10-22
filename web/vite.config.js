import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API server runs separately; proxy to it so the app can use relative URLs.
const server = process.env.HOMEFLIX_SERVER || 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5173,
    host: true,
    proxy: { '/api': server, '/media': server },
  },
});
