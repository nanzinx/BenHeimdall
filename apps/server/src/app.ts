// Monta o Express e o Socket.IO a partir das dependências (facilita os testes).
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { MockArgusClient, type ArgusClient } from '@benheimdall/argus-client';
import type { Saude } from '@benheimdall/shared';
import { ehLoopback, normalizarIp } from './acesso/ips';
import { ErroAcesso, type ServicoAcesso } from './acesso/servico';
import { RAIZ, type Config } from './config';
import { bancoOk, type Banco } from './db/banco';
import type { CicloLeitura } from './leitura/ciclo';
import type { RegistroStatus } from './leitura/eventos';
import type { Log } from './log';
import { rotasDev } from './rotas/dev';
import { rotasPainel } from './rotas/painel';
import { rotasSessao } from './rotas/sessao';
import { rotasTransferencia } from './rotas/transferencia';
import { rotasUsuarios } from './rotas/usuarios';
import { ligarSocket } from './socket';

export interface Dependencias {
  config: Config;
  db: Banco;
  argus: ArgusClient;
  ciclo: CicloLeitura;
  registro: RegistroStatus;
  servico: ServicoAcesso;
  log: Log;
}

export function criarApp(deps: Dependencias) {
  const { config, db, argus, ciclo, registro, servico, log } = deps;
  const producao = config.producao;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  // Só os IPs de IPS_PERMITIDOS (e a própria máquina) entram em qualquer parte do sistema.
  const ipPermitido = (ip: string | null) =>
    config.ipsPermitidos.entradas.length === 0 || ehLoopback(ip) || config.ipsPermitidos.contem(ip);
  const negadosNoLog = new Set<string>();
  app.use((req, res, next) => {
    const ip = normalizarIp(req.ip);
    if (ipPermitido(ip)) return next();
    if (negadosNoLog.size < 1000 && !negadosNoLog.has(ip ?? '')) {
      negadosNoLog.add(ip ?? '');
      log.warn({ ip, rota: req.path }, 'Acesso recusado: IP fora de IPS_PERMITIDOS');
    }
    res.status(403).type('text/plain; charset=utf-8').send('Acesso não permitido a partir deste endereço.');
  });
  app.use(express.json({ limit: '20kb' }));
  app.use(cookieParser(config.sessionSecret));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  const simulacao = !producao && argus instanceof MockArgusClient;

  // /health: mesmo endereço de saúde dos serviços do BenUra (scripts do Windows, túnel).
  app.get(['/api/saude', '/health'], (_req, res) => {
    const e = ciclo.estado();
    const banco = bancoOk(db);
    const corpo: Saude = {
      ok: e.online && banco,
      argus: { modo: argus.modo, online: e.online, ultimaLeitura: e.ultimaLeitura, ultimoErro: e.ultimoErro },
      banco: { ok: banco },
      simulacao,
    };
    res.status(banco ? 200 : 503).json(corpo);
  });

  app.use('/api/sessao', rotasSessao(servico, producao));
  app.use('/api', rotasPainel(servico, producao, ciclo, registro));
  // Antes de rotasUsuarios: aquele roteador exige perfil admin em tudo o que passa por ele.
  app.use('/api', rotasTransferencia(servico, producao, ciclo, argus, log));
  app.use('/api', rotasUsuarios(servico, producao));
  if (simulacao && argus instanceof MockArgusClient) app.use('/api/dev', rotasDev(servico, argus, ciclo));

  app.use('/api', (_req, res) => {
    res.status(404).json({ codigo: 'NAO_ENCONTRADO', mensagem: 'Rota não encontrada.' });
  });

  // Em produção, o próprio backend serve o front já compilado (mesma origem do cookie).
  const web = path.join(RAIZ, 'apps/web/dist');
  if (producao && existsSync(web)) {
    app.use(express.static(web, { index: false }));
    app.get(/^(?!\/api\/|\/socket\.io\/).*/, (_req, res) => res.sendFile(path.join(web, 'index.html')));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      res
        .status(400)
        .json({ codigo: 'ENTRADA_INVALIDA', mensagem: err.issues[0]?.message ?? 'Dados inválidos.' });
      return;
    }
    if (err instanceof ErroAcesso) {
      res.status(err.status).json({ codigo: err.codigo, mensagem: err.message });
      return;
    }
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({ codigo: 'ENTRADA_INVALIDA', mensagem: 'JSON inválido.' });
      return;
    }
    log.error({ err }, 'Erro inesperado na API');
    res.status(500).json({ codigo: 'ERRO', mensagem: 'Erro inesperado. Tente de novo.' });
  });

  const http = createServer(app);
  const io = ligarSocket(http, {
    servico,
    ciclo,
    segredo: config.sessionSecret,
    log,
    confiarProxy: config.trustProxy,
    ipPermitido,
  });
  return { app, http, io };
}
