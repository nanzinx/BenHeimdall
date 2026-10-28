import pino from 'pino';

export type Log = pino.Logger;

export function criarLog(nivel: string, producao: boolean): Log {
  return pino({
    level: nivel,
    // Em desenvolvimento, saída legível; em produção, JSON (uma linha por evento).
    transport: producao ? undefined : { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss' } },
  });
}

export const logSilencioso: Log = pino({ level: 'silent' });
