// Atualiza o BenHeimdall com um comando só.
//   npm run atualizar            → no PC: git pull + npm install (depois é só rodar npm run dev).
//   npm run atualizar:servidor   → no servidor: para no PM2, git pull, npm install, compila e sobe de novo.
// O .env e a pasta data (banco) não são mexidos. As migrações do banco rodam sozinhas ao subir.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pasta = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const servidor = process.argv.includes('--servidor');
const pm2 = path.join(pasta, 'node_modules', 'pm2', 'bin', 'pm2');

function rodar(titulo, comando, args, { npm = false } = {}) {
  console.log(`\n▶ ${titulo}`);
  // No Windows o npm é um .cmd: só roda pelo shell.
  const r = spawnSync(comando, args, {
    cwd: pasta,
    stdio: 'inherit',
    shell: npm && process.platform === 'win32',
  });
  return r.status === 0;
}
const pm2Cmd = (titulo, ...args) => existsSync(pm2) && rodar(titulo, process.execPath, [pm2, ...args]);

function falhar(mensagem) {
  console.error(`\n✖ ${mensagem}`);
  if (servidor) {
    // Não deixa o painel fora do ar: tenta subir de novo o que estiver compilado.
    pm2Cmd(
      'Subindo o painel de novo (versão anterior)',
      'startOrRestart',
      'ecosystem.config.cjs',
      '--env',
      'production',
    );
  }
  process.exit(1);
}

// No Windows o servidor em execução trava o módulo nativo do SQLite: o npm install não conseguiria trocá-lo.
if (servidor) pm2Cmd('Parando o benheimdall no PM2', 'stop', 'benheimdall');

// O npm install reescreve o package-lock.json em algumas máquinas (versão do npm, Windows), o que
// travaria o git pull. Ele é regenerado no passo seguinte, então volta à versão do GitHub.
rodar('Descartando mudanças locais no package-lock.json', 'git', ['checkout', '--', 'package-lock.json']);

if (!rodar('Baixando a versão nova (git pull)', 'git', ['pull', '--ff-only']))
  falhar(
    'O git pull não foi possível (algum arquivo do projeto foi alterado nesta máquina).\n' +
      '  Para alinhar com o GitHub, descartando essas alterações (o .env e a pasta data ficam):\n' +
      '    git fetch origin\n' +
      '    git reset --hard origin/main\n' +
      '  e rode este comando de novo.',
  );

if (!rodar('Instalando dependências (npm install)', 'npm', ['install'], { npm: true }))
  falhar('O npm install falhou. Veja a mensagem acima.');

if (servidor) {
  if (!rodar('Compilando (npm run build)', 'npm', ['run', 'build'], { npm: true }))
    falhar('A compilação falhou. Veja a mensagem acima.');
  if (!pm2Cmd('Subindo no PM2', 'startOrRestart', 'ecosystem.config.cjs', '--env', 'production'))
    falhar('O PM2 não subiu o painel. Rode npm run pm2:logs para ver o motivo.');
  pm2Cmd('Salvando a lista do PM2', 'save', '--force');
  console.log('\n✔ Atualizado e no ar. Confira com: npm run servico:verificar');
} else {
  console.log('\n✔ Atualizado. Agora rode: npm run dev');
}
