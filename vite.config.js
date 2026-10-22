import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const server = 'http://localhost:8080';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5173,
    host: true,
    proxy: { '/api': server, '/media': server },
  },
});
