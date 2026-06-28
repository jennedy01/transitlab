import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// The repo lives on a network (SMB) volume, so dependency optimisation and
// file watching are noticeably slower than a local disk. Polling keeps HMR
// reliable on the share.
export default defineConfig({
  // Override with VITE_BASE for sub-path hosting (e.g. GitHub Pages "/transitlab/").
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('../shared/src', import.meta.url)),
    },
  },
  server: {
    // Offset from 5173 so TRANSITLAB can run alongside other local projects.
    port: 5174,
    strictPort: true,
    host: true, // listen on 0.0.0.0 so a forwarded/Codespace host can reach it
    // Allow the GitHub Codespaces forwarding domain.
    allowedHosts: ['.app.github.dev', 'localhost', '127.0.0.1'],
    // When VITE_API_BASE is empty (Codespaces), the client calls /api same-origin
    // and Vite proxies it to the local API — one public port, no CORS.
    proxy: {
      '/api': { target: 'http://localhost:4010', changeOrigin: true },
    },
    watch: { usePolling: true, interval: 300 },
  },
});
