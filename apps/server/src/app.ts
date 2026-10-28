// Monta o Express e o Socket.IO a partir das dependências (facilita os testes).
import { createServer } from 'node:http';
import express from 'express';
import type { ArgusClient } from '@benheimdall/argus-client';
import type { Saude } from '@benheimdall/shared';
import type { Config } from './config';
import { bancoOk, type Banco } from './db/banco';
import type { CicloLeitura } from './leitura/ciclo';
import type { RegistroStatus } from './leitura/eventos';
import type { Log } from './log';

export interface Dependencias {
  config: Config;
  db: Banco;
  argus: ArgusClient;
  ciclo: CicloLeitura;
  registro: RegistroStatus;
  log: Log;
}

export function criarApp(deps: Dependencias) {
  const { config, db, argus, ciclo } = deps;
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '20kb' }));

  app.get('/api/saude', (_req, res) => {
    const e = ciclo.estado();
    const banco = bancoOk(db);
    const corpo: Saude = {
      ok: e.online && banco,
      argus: { modo: argus.modo, online: e.online, ultimaLeitura: e.ultimaLeitura, ultimoErro: e.ultimoErro },
      banco: { ok: banco },
    };
    res.status(banco ? 200 : 503).json(corpo);
  });

  const http = createServer(app);
  return { app, http, config };
}
