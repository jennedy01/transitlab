import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// The repo lives on a network (SMB) volume, so dependency optimisation and
// file watching are noticeably slower than a local disk. Polling keeps HMR
// reliable on the share.
export default defineConfig({
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
    watch: { usePolling: true, interval: 300 },
  },
});
