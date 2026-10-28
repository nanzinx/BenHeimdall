// Configuração do backend, lida das variáveis de ambiente e validada com Zod.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { emailLoginSchema } from '@benheimdall/shared';
import { TEXTOS_STATUS_PADRAO } from '@benheimdall/argus-client';
import { criarListaIps, lerListaIps } from './acesso/ips';
import type { LimitesPausa } from './leitura/normalizador';

// Vale para src/config.ts (dev) e para dist/index.js (bundle): os dois ficam 3 níveis abaixo da raiz.
export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * Lê o .env da raiz (KEY=valor, # comentários, aspas opcionais) sem sobrescrever o que já está
 * definido: variáveis do sistema, do PM2 ou do Docker valem mais que o arquivo.
 * Feito à mão para funcionar em qualquer Node 20 (a flag --env-file-if-exists é recente).
 */
export function carregarDotenv(
  arquivo = path.join(RAIZ, '.env'),
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!existsSync(arquivo)) return false;
  // Dentro do arquivo, a última ocorrência de uma variável vale (como no dotenv).
  const doArquivo = new Map<string, string>();
  for (const linha of readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) doArquivo.set(m[1]!, m[2]!.replace(/^(['"])(.*)\1$/, '$2'));
  }
  for (const [nome, valor] of doArquivo) if (env[nome] === undefined) env[nome] = valor;
  return true;
}

const booleano = z
  .enum(['true', 'false', '1', '0', ''])
  .default('false')
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3020),
  ARGUS_MODE: z.enum(['mock', 'real']).default('mock'),
  // Mesmos nomes e padrões do BenURA (ARGUS_BASE também é aceito).
  ARGUS_BASE_URL: z.string().default(''),
  ARGUS_BASE: z.string().default(''),
  ARGUS_TOKEN: z.string().default(''),
  ARGUS_TIMEOUT_MS: z.coerce.number().int().min(500).default(5000),
  ARGUS_CONCORRENCIA: z.coerce.number().int().min(1).max(50).default(10),
  ARGUS_CAMPANHAS_IDS: z.string().default(''),
  ARGUS_PAUSA_FILE: z.string().default(''),
  STATUS_LIVRE: z.string().default(''),
  STATUS_ATENDIMENTO: z.string().default(''),
  STATUS_POS_ATENDIMENTO: z.string().default(''),
  STATUS_OFFLINE: z.string().default(''),
  EQUIPES_FILE: z.string().default('config/equipes.json'),
  BAIAS_FILE: z.string().default('config/baias.json'),
  ARGUS_MOCK_FALHA: booleano,
  POLL_MS: z.coerce.number().int().min(500).default(3000),
  DB_PATH: z.string().default('data/benheimdall.db'),
  SESSION_SECRET: z.string().default(''),
  SESSAO_MIN: z.coerce.number().int().positive().default(15),
  TV_ALLOWED_IPS: z.string().default(''),
  IPS_PERMITIDOS: z.string().default(''),
  // E-mail do primeiro admin (os logins são todos por e-mail).
  ADMIN_USER: emailLoginSchema.default('renan.leite@benconsig.com'),
  ADMIN_SENHA_INICIAL: z.string().default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  PAUSAS_PATH: z.string().default('config/pausas.json'),
  // Atrás de proxy reverso (nginx, Caddy): número de saltos ou lista de IPs confiáveis.
  // Necessário para o IP real chegar ao backend (regra do IP da TV e log de acessos).
  TRUST_PROXY: z.string().default(''),
});

export type Config = ReturnType<typeof carregarConfig>;

export function carregarConfig(env: NodeJS.ProcessEnv = process.env) {
  const e = envSchema.parse(env);
  const producao = e.NODE_ENV === 'production';
  if (e.ARGUS_MODE === 'real' && !e.ARGUS_TOKEN)
    throw new Error('ARGUS_MODE=real precisa do ARGUS_TOKEN (o mesmo do BenURA, no .env).');
  if (producao && e.SESSION_SECRET.length < 32)
    throw new Error('SESSION_SECRET precisa ter pelo menos 32 caracteres em produção.');
  return {
    producao,
    nodeEnv: e.NODE_ENV,
    porta: e.PORT,
    argus: {
      modo: e.ARGUS_MODE,
      baseUrl: e.ARGUS_BASE_URL || e.ARGUS_BASE || 'https://argus.app.br/apiargus/cmd',
      token: e.ARGUS_TOKEN,
      mockFalha: e.ARGUS_MOCK_FALHA,
      timeoutMs: e.ARGUS_TIMEOUT_MS,
      concorrencia: e.ARGUS_CONCORRENCIA,
      campanhasIds: lista(e.ARGUS_CAMPANHAS_IDS).map(Number).filter(Number.isInteger),
      arquivoPausa: e.ARGUS_PAUSA_FILE ? path.resolve(RAIZ, e.ARGUS_PAUSA_FILE) : undefined,
      textosStatus: {
        livre: listaOu(e.STATUS_LIVRE, TEXTOS_STATUS_PADRAO.livre),
        atendimento: listaOu(e.STATUS_ATENDIMENTO, TEXTOS_STATUS_PADRAO.atendimento),
        posAtendimento: listaOu(e.STATUS_POS_ATENDIMENTO, TEXTOS_STATUS_PADRAO.posAtendimento),
        offline: listaOu(e.STATUS_OFFLINE, TEXTOS_STATUS_PADRAO.offline),
      },
      equipes: lerJsonOpcional(path.resolve(RAIZ, e.EQUIPES_FILE), equipesSchema),
      baias: lerJsonOpcional(path.resolve(RAIZ, e.BAIAS_FILE), baiasSchema),
    },
    pollMs: e.POLL_MS,
    dbPath: path.resolve(RAIZ, e.DB_PATH),
    // Sem segredo em desenvolvimento, gera um aleatório (as sessões caem a cada reinício).
    sessionSecret: e.SESSION_SECRET || randomBytes(32).toString('hex'),
    sessaoMin: e.SESSAO_MIN,
    // Aceitam IPv4/IPv6 e faixas CIDR. Valores inválidos derrubam a partida (melhor que liberar geral).
    tvIps: criarListaIps(lerListaIps(e.TV_ALLOWED_IPS)),
    /** Vazia = sem restrição. Loopback (a própria máquina) é sempre aceito. */
    ipsPermitidos: criarListaIps(lerListaIps(e.IPS_PERMITIDOS)),
    adminUser: e.ADMIN_USER,
    adminSenhaInicial: e.ADMIN_SENHA_INICIAL,
    logLevel: e.LOG_LEVEL,
    limites: carregarLimites(path.resolve(RAIZ, e.PAUSAS_PATH)),
    trustProxy: lerTrustProxy(e.TRUST_PROXY),
  };
}

/** '' = desligado; '1' = um salto; 'loopback' ou lista de IPs/sub-redes separados por vírgula. */
function lerTrustProxy(v: string): boolean | number | string {
  if (!v || v === 'false') return false;
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}

const lista = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
const listaOu = (s: string, padrao: string[]) => (lista(s).length ? lista(s) : padrao);

// Chaves começadas por "_" são comentários nos arquivos de exemplo.
const semComentarios = <T>(r: Record<string, T>) =>
  Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith('_')));
/** NOME DO SUPERVISOR (como na Argus) → número da equipe. */
const equipesSchema = z.record(z.string(), z.unknown()).transform((r, ctx) => {
  const saida: Record<string, number> = {};
  for (const [nome, n] of Object.entries(semComentarios(r))) {
    if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > 99)
      ctx.addIssue({ code: 'custom', message: `equipe inválida para "${nome}" (use 1 a 99)` });
    else saida[nome] = n as number;
  }
  return saida;
});
const baiaSchema = z.object({
  lado: z.enum(['E', 'D']),
  posicao: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
});
/** Ramal → baia. */
const baiasSchema = z
  .record(z.string(), z.unknown())
  .transform((r) => semComentarios(r))
  .pipe(z.record(z.string(), baiaSchema));

/** Arquivo de configuração opcional: ausente = undefined; presente e inválido = erro na partida. */
function lerJsonOpcional<T>(arquivo: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): T | undefined {
  if (!existsSync(arquivo)) return undefined;
  try {
    return schema.parse(JSON.parse(readFileSync(arquivo, 'utf8')));
  } catch (err) {
    throw new Error(`Arquivo de configuração inválido: ${arquivo} — ${(err as Error).message}`);
  }
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
