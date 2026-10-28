import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Lê o mesmo .env da raiz que o backend usa (PORT, DEV_ALLOWED_HOSTS).
  const env = { ...loadEnv(mode, path.resolve(__dirname, '../..'), ''), ...process.env };
  const backend = `http://localhost:${env.PORT ?? 3020}`;
  // Domínios extras liberados no servidor de dev (ex.: túnel nomeado do Cloudflare).
  const extras = (env.DEV_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);

  return {
    plugins: [react()],
    server: {
      port: 5180,
      // 5173 fica livre para o painel do BenURA em dev.
      strictPort: true,
      // Túnel rápido do Cloudflare (npm run dev:tunel) usa *.trycloudflare.com.
      allowedHosts: ['.trycloudflare.com', ...extras],
      // Front e API na mesma origem: o cookie SameSite=Strict funciona sem CORS.
      // xfwd repassa o IP do cliente ao backend (TRUST_PROXY=loopback), inclusive via túnel.
      proxy: {
        '/api': { target: backend, xfwd: true },
        '/socket.io': { target: backend, ws: true, xfwd: true },
      },
    },
  };
});
