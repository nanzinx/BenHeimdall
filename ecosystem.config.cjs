// Configuração do PM2 para rodar o BenHeimdall no servidor, ao lado dos outros sistemas.
//
//   npm ci && npm run build
//   npm run pm2:iniciar      (ou: npx pm2 startOrRestart ecosystem.config.cjs --env production)
//   npm run pm2:logs
//   npm run pm2:parar
//
// No Windows (como no BenURA), npm run servico:instalar faz tudo isso e cria a tarefa
// "BenHeimdall" no Agendador, que sobe o painel ao ligar o PC. Em Linux: npx pm2 save && npx pm2 startup.
// O PM2 é compartilhado com o BenURA no mesmo servidor: aqui só existe o processo "benheimdall".
//
// IMPORTANTE: uma única instância, em modo fork. O BenHeimdall tem UM laço de leitura da Argus
// e o Socket.IO guarda as conexões em memória; cluster ou várias instâncias duplicariam as
// leituras e quebrariam o tempo real.
const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');

/** Lê o .env da raiz (KEY=valor, # comentários) para repassar ao processo. */
function lerEnv(arquivo) {
  if (!existsSync(arquivo)) return {};
  const env = {};
  for (const linha of readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

const raiz = __dirname;
const doArquivo = lerEnv(path.join(raiz, '.env'));

module.exports = {
  apps: [
    {
      name: 'benheimdall',
      cwd: raiz,
      script: 'apps/server/dist/index.js',
      node_args: '--enable-source-maps',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      // Reinícios com espera crescente se o processo cair em sequência.
      exp_backoff_restart_delay: 200,
      max_restarts: 50,
      min_uptime: '10s',
      max_memory_restart: '400M',
      // Dá tempo de fechar o banco e as conexões no SIGINT.
      kill_timeout: 5000,
      watch: false,
      time: true,
      merge_logs: true,
      out_file: path.join(raiz, 'logs/benheimdall.out.log'),
      error_file: path.join(raiz, 'logs/benheimdall.err.log'),
      env: { ...doArquivo, NODE_ENV: doArquivo.NODE_ENV ?? 'development' },
      env_production: { ...doArquivo, NODE_ENV: 'production' },
    },
  ],
};
