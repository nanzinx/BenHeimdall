import { describe, expect, it } from 'vitest';
import { MockArgusClient } from '@benheimdall/argus-client';
import { painelSchema } from '@benheimdall/shared';
import { abrirBanco } from '../src/db/banco';
import { CicloLeitura, esperaAposFalha } from '../src/leitura/ciclo';
import { RegistroStatus } from '../src/leitura/eventos';
import { logSilencioso } from '../src/log';
import { LIMITES } from './ajuda';

describe('ciclo de leitura', () => {
  it('lê, grava eventos e emite o painel; na queda mantém o último painel e volta sozinho', async () => {
    let agora = Date.parse('2026-03-02T15:00:00Z');
    const mock = new MockArgusClient({ semente: 3, agora: () => agora });
    const db = abrirBanco(':memory:');
    const ciclo = new CicloLeitura({
      argus: mock,
      registro: new RegistroStatus(db),
      limites: LIMITES,
      pollMs: 3000,
      log: logSilencioso,
      agora: () => new Date(agora),
    });
    const emitidos: boolean[] = [];
    ciclo.on('painel', (p) => emitidos.push(p.argusOnline));

    expect(await ciclo.executar()).toBe(true);
    const p1 = ciclo.painelAtual();
    painelSchema.parse(p1);
    expect(p1.agentes).toHaveLength(48);
    expect((db.prepare('SELECT COUNT(*) AS n FROM status_eventos').get() as { n: number }).n).toBe(48);

    mock.simularFalha();
    agora += 3000;
    expect(await ciclo.executar()).toBe(false);
    const p2 = ciclo.painelAtual();
    expect(p2.argusOnline).toBe(false);
    expect(p2.agentes).toEqual(p1.agentes);
    expect(p2.ultimaLeituraArgus).toBe(p1.ultimaLeituraArgus);
    expect(ciclo.estado().ultimoErro).toContain('ArgusIndisponivelError');

    mock.restaurar();
    agora += 6000;
    expect(await ciclo.executar()).toBe(true);
    expect(ciclo.painelAtual().argusOnline).toBe(true);
    expect(emitidos).toEqual([true, false, true]);
  });

  it('a espera cresce a cada falha seguida, até 30 s', () => {
    expect([1, 2, 3, 4, 5, 6, 20].map((n) => esperaAposFalha(3000, n))).toEqual([
      3000, 6000, 12000, 24000, 30000, 30000, 30000,
    ]);
  });
});
