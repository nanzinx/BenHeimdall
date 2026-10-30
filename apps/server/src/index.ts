// Ponto de entrada do backend.
import { criarArgusClient } from '@benheimdall/argus-client';
import { Repositorio } from './acesso/repositorio';
import { ServicoAcesso } from './acesso/servico';
import { criarApp } from './app';
import { carregarConfig, carregarDotenv } from './config';
import { abrirBanco } from './db/banco';
import { CicloLeitura } from './leitura/ciclo';
import { RegistroStatus } from './leitura/eventos';
import { criarLog } from './log';
import { explicarFalhaNaPartida } from './partida';

// Falha ao subir (configuração inválida, banco, módulo nativo...): explica em português e sai.
process.on('uncaughtException', (err) => {
  console.error(explicarFalhaNaPartida(err));
  process.exit(1);
});

carregarDotenv();
const config = carregarConfig();
const log = criarLog(config.logLevel, config.producao);
if (config.ipsPermitidos.entradas.length)
  log.info({ ips: config.ipsPermitidos.entradas }, 'Acesso restrito aos IPs de IPS_PERMITIDOS');
if (config.ipsPermitidos.entradas.length && config.trustProxy === false)
  log.warn('IPS_PERMITIDOS sem TRUST_PROXY: atrás de proxy/túnel, todo acesso parece vir do proxy.');
if (!process.env.SESSION_SECRET)
  log.warn('SESSION_SECRET vazio: usando um segredo aleatório (as sessões caem a cada reinício).');

const db = abrirBanco(config.dbPath);
const registro = new RegistroStatus(db);
const servico = new ServicoAcesso(new Repositorio(db), {
  sessaoMin: config.sessaoMin,
  tvIps: config.tvIps,
  log,
  acessoLivre: config.acessoLivre,
});
if (config.acessoLivre)
  log.warn('ACESSO LIVRE: sem login (NODE_ENV=development). No servidor (production) o login volta sozinho.');
const argus = criarArgusClient(config.argus);
const ciclo = new CicloLeitura({
  argus,
  registro,
  limites: config.limites,
  pollMs: config.pollMs,
  log,
  nomesEquipes: config.nomesEquipes,
});

const senhaGerada = await servico.garantirAdminInicial(config.adminUser, config.adminSenhaInicial);
if (senhaGerada)
  log.warn(
    { usuario: config.adminUser, senhaTemporaria: senhaGerada },
    'Primeiro admin criado com senha gerada (troca obrigatória)',
  );

const { http, io } = criarApp({ config, db, argus, ciclo, registro, servico, log });

ciclo.iniciar();
const varredura = setInterval(() => servico.varrerExpiradas(), 60_000);
http.listen(config.porta, () => {
  log.info(
    { porta: config.porta, argus: argus.modo, pollMs: config.pollMs, db: config.dbPath },
    'BenHeimdall no ar',
  );
});

function encerrar(sinal: string) {
  log.info({ sinal }, 'Encerrando');
  ciclo.parar();
  clearInterval(varredura);
  void io.close();
  http.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => encerrar('SIGINT'));
process.on('SIGTERM', () => encerrar('SIGTERM'));
