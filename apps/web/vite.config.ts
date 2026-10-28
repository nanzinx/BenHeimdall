import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backend = `http://localhost:${process.env.PORT ?? 3001}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Front e API na mesma origem: o cookie SameSite=Strict funciona sem CORS.
    proxy: {
      '/api': backend,
      '/socket.io': { target: backend, ws: true },
    },
  },
});
