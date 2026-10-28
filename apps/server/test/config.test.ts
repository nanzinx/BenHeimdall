import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { carregarConfig, carregarDotenv } from '../src/config';

describe('configuração', () => {
  it('lê o .env sem sobrescrever variáveis já definidas', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'benheimdall-env-'));
    try {
      const arquivo = path.join(dir, '.env');
      writeFileSync(
        arquivo,
        '# comentário\r\nPORT=4000\nPOLL_MS="5000"\nTV_ALLOWED_IPS=10.0.0.5\nARGUS_TOKEN=\n\nLIXO\nARGUS_TOKEN=abc\n',
      );
      const env: NodeJS.ProcessEnv = { PORT: '3009' };
      expect(carregarDotenv(arquivo, env)).toBe(true);
      // Variável do sistema vale mais; no arquivo, a última ocorrência vale.
      expect(env).toMatchObject({
        PORT: '3009',
        POLL_MS: '5000',
        TV_ALLOWED_IPS: '10.0.0.5',
        ARGUS_TOKEN: 'abc',
      });
      expect(carregarDotenv(path.join(dir, 'nao-existe'), env)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('ADMIN_USER precisa ser um e-mail (login padronizado)', () => {
    expect(carregarConfig({}).adminUser).toBe('renan.leite@benconsig.com');
    expect(carregarConfig({ ADMIN_USER: ' Renan.Leite@Benconsig.com ' }).adminUser).toBe(
      'renan.leite@benconsig.com',
    );
    expect(() => carregarConfig({ ADMIN_USER: 'admin' })).toThrow(/e-mail válido/);
  });

  it('TRUST_PROXY aceita saltos, listas e desligado', () => {
    expect(carregarConfig({ TRUST_PROXY: '' }).trustProxy).toBe(false);
    expect(carregarConfig({ TRUST_PROXY: '1' }).trustProxy).toBe(1);
    expect(carregarConfig({ TRUST_PROXY: 'loopback,uniquelocal' }).trustProxy).toBe('loopback,uniquelocal');
  });
});
