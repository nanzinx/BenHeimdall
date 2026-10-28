// Ponto de entrada do backend.
import { criarArgusClient } from '@benheimdall/argus-client';
import { criarApp } from './app';
import { carregarConfig } from './config';
import { abrirBanco } from './db/banco';
import { CicloLeitura } from './leitura/ciclo';
import { RegistroStatus } from './leitura/eventos';
import { criarLog } from './log';

const config = carregarConfig();
const log = criarLog(config.logLevel, config.producao);
const db = abrirBanco(config.dbPath);
const registro = new RegistroStatus(db);
const argus = criarArgusClient(config.argus);
const ciclo = new CicloLeitura({ argus, registro, limites: config.limites, pollMs: config.pollMs, log });

const { http } = criarApp({ config, db, argus, ciclo, registro, log });

ciclo.iniciar();
http.listen(config.porta, () => {
  log.info(
    { porta: config.porta, argus: argus.modo, pollMs: config.pollMs, db: config.dbPath },
    'BenHeimdall no ar',
  );
});

function encerrar(sinal: string) {
  log.info({ sinal }, 'Encerrando');
  ciclo.parar();
  http.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => encerrar('SIGINT'));
process.on('SIGTERM', () => encerrar('SIGTERM'));
