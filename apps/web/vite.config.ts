import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Lê só PORT e DEV_ALLOWED_HOSTS do .env da raiz. Não usa o loadEnv do Vite de propósito: ele
 * aproveitaria o NODE_ENV=development do .env e o build sairia com o React de desenvolvimento.
 */
function lerDoEnv(): Record<string, string> {
  const arquivo = path.resolve(__dirname, '../../.env');
  const env: Record<string, string> = {};
  if (!existsSync(arquivo)) return env;
  for (const linha of readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*(PORT|DEV_ALLOWED_HOSTS)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]!] = m[2]!.replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

export default defineConfig(() => {
  const env = { ...lerDoEnv(), ...process.env };
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
      // Túneis: Cloudflare rápido (npm run dev:tunel) e ngrok (npm run dev:ngrok).
      allowedHosts: [
        '.trycloudflare.com',
        '.ngrok-free.dev',
        '.ngrok-free.app',
        '.ngrok.dev',
        '.ngrok.app',
        ...extras,
      ],
      // Front e API na mesma origem: o cookie SameSite=Strict funciona sem CORS.
      // xfwd repassa o IP do cliente ao backend (TRUST_PROXY=loopback), inclusive via túnel.
      proxy: {
        '/api': { target: backend, xfwd: true },
        '/socket.io': { target: backend, ws: true, xfwd: true },
      },
    },
  };
});
