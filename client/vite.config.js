import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// During development the web app runs on port 5173 and forwards API calls to
// the server on port 3000. In production the server delivers both.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: `http://localhost:${process.env.PORT || 3000}`, changeOrigin: false } },
  },
});
