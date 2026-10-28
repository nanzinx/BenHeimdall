// Configuração do backend, lida das variáveis de ambiente e validada com Zod.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { LimitesPausa } from './leitura/normalizador';

export const RAIZ = path.resolve(import.meta.dirname, '../../..');

const booleano = z
  .enum(['true', 'false', '1', '0', ''])
  .default('false')
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  ARGUS_MODE: z.enum(['mock', 'real']).default('mock'),
  ARGUS_BASE_URL: z.string().default(''),
  ARGUS_TOKEN: z.string().default(''),
  ARGUS_MOCK_FALHA: booleano,
  POLL_MS: z.coerce.number().int().min(500).default(3000),
  DB_PATH: z.string().default('data/benheimdall.db'),
  SESSION_SECRET: z.string().default(''),
  SESSAO_MIN: z.coerce.number().int().positive().default(15),
  TV_ALLOWED_IPS: z.string().default(''),
  ADMIN_USER: z.string().trim().toLowerCase().default('admin'),
  ADMIN_SENHA_INICIAL: z.string().default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  PAUSAS_PATH: z.string().default('config/pausas.json'),
});

export type Config = ReturnType<typeof carregarConfig>;

export function carregarConfig(env: NodeJS.ProcessEnv = process.env) {
  const e = envSchema.parse(env);
  const producao = e.NODE_ENV === 'production';
  if (producao && e.SESSION_SECRET.length < 32)
    throw new Error('SESSION_SECRET precisa ter pelo menos 32 caracteres em produção.');
  return {
    producao,
    nodeEnv: e.NODE_ENV,
    porta: e.PORT,
    argus: {
      modo: e.ARGUS_MODE,
      baseUrl: e.ARGUS_BASE_URL,
      token: e.ARGUS_TOKEN,
      mockFalha: e.ARGUS_MOCK_FALHA,
    },
    pollMs: e.POLL_MS,
    dbPath: path.resolve(RAIZ, e.DB_PATH),
    // Sem segredo em desenvolvimento, gera um aleatório (as sessões caem a cada reinício).
    sessionSecret: e.SESSION_SECRET || randomBytes(32).toString('hex'),
    sessaoMin: e.SESSAO_MIN,
    tvIps: e.TV_ALLOWED_IPS.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    adminUser: e.ADMIN_USER,
    adminSenhaInicial: e.ADMIN_SENHA_INICIAL,
    logLevel: e.LOG_LEVEL,
    limites: carregarLimites(path.resolve(RAIZ, e.PAUSAS_PATH)),
  };
}

const pausasSchema = z.object({
  padraoMin: z.number().positive(),
  limitesMin: z.record(z.string(), z.number().positive()),
});

export function carregarLimites(arquivo: string): LimitesPausa {
  const p = pausasSchema.parse(JSON.parse(readFileSync(arquivo, 'utf8')));
  return {
    padraoSeg: Math.round(p.padraoMin * 60),
    porMotivoSeg: Object.fromEntries(
      Object.entries(p.limitesMin).map(([m, min]) => [m, Math.round(min * 60)]),
    ),
  };
}
