import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ArgusIndisponivelError, MockArgusClient, agenteBrutoSchema, chamadaBrutaSchema } from '../src';

describe('MockArgusClient', () => {
  it('simula 40 agentes, 5 equipes × 8 baias, com respostas no formato bruto', async () => {
    const mock = new MockArgusClient({ semente: 7 });
    const agentes = z.array(agenteBrutoSchema).parse(await mock.listarAgentes());
    expect(agentes).toHaveLength(40);
    for (const eq of [1, 2, 3, 4, 5]) {
      const time = agentes.filter((a) => a.equipe === eq);
      expect(time).toHaveLength(8);
      for (const lado of ['E', 'D'] as const)
        expect(
          time
            .filter((a) => a.lado === lado)
            .map((a) => a.posicao)
            .sort(),
        ).toEqual([1, 2, 3, 4]);
    }
    z.array(chamadaBrutaSchema).parse(await mock.listarChamadasAtivas());
    expect(agentes.every((a) => a.status in mock.mapaStatus)).toBe(true);
  });

  it('as transições avançam com o tempo', async () => {
    let agora = Date.parse('2026-03-02T12:00:00Z');
    const mock = new MockArgusClient({ semente: 7, agora: () => agora });
    const antes = JSON.stringify(await mock.listarAgentes());
    agora += 60_000;
    expect(JSON.stringify(await mock.listarAgentes())).not.toBe(antes);
  });

  it('modo de falha derruba e restaura a Argus', async () => {
    let agora = 0;
    const mock = new MockArgusClient({ semente: 1, agora: () => agora, falha: true });
    await expect(mock.listarAgentes()).rejects.toBeInstanceOf(ArgusIndisponivelError);
    mock.restaurar();
    await expect(mock.listarAgentes()).resolves.toHaveLength(40);
    mock.simularFalha(10);
    await expect(mock.obterFila()).rejects.toBeInstanceOf(ArgusIndisponivelError);
    agora += 10_000;
    await expect(mock.obterFila()).resolves.toBeDefined();
  });
});
