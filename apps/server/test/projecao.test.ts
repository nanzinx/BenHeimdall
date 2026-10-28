import { describe, expect, it } from 'vitest';
import { MockArgusClient } from '@benheimdall/argus-client';
import { painelSchema, type Painel } from '@benheimdall/shared';
import { normalizar } from '../src/leitura/normalizador';
import { projetarPainel } from '../src/projecao';
import { LIMITES, lerMock } from './ajuda';

async function painelCompleto(): Promise<Painel> {
  const agora = new Date('2026-03-02T15:00:00Z');
  const mock = new MockArgusClient({ semente: 5, agora: () => agora.getTime() });
  return normalizar(await lerMock(mock), {
    agora,
    ultimaLeitura: agora,
    argusOnline: true,
    mapaStatus: mock.mapaStatus,
    limites: LIMITES,
    pausaDiaSeg: () => 60,
  });
}

describe('projeção por perfil', () => {
  it('admin recebe tudo', async () => {
    const p = await painelCompleto();
    expect(projetarPainel(p, { perfil: 'admin', equipe: null })).toEqual(p);
  });

  it('supervisor não recebe dados de cliente de outra equipe, só a campanha', async () => {
    const p = await painelCompleto();
    const proj = projetarPainel(p, { perfil: 'supervisor', equipe: 2 });
    painelSchema.parse(proj);
    expect(proj.agentes).toHaveLength(40);

    const outras = proj.agentes.filter((a) => a.equipe !== 2 && a.atendimento);
    const propria = proj.agentes.filter((a) => a.equipe === 2 && a.atendimento);
    expect(outras.length).toBeGreaterThan(0);
    expect(propria.length).toBeGreaterThan(0);
    for (const a of outras) expect(Object.keys(a.atendimento!).sort()).toEqual(['campanha', 'inicio']);
    for (const a of propria) expect(a.atendimento!.codigoCliente).toBeTruthy();

    // Os códigos e telefones das outras equipes não aparecem em lugar nenhum.
    const json = JSON.stringify(proj);
    for (const a of p.agentes.filter((x) => x.equipe !== 2 && x.atendimento)) {
      expect(json).not.toContain(a.atendimento!.telefoneMascarado);
      expect(json).not.toContain(`"${a.atendimento!.codigoCliente}"`);
    }
    // Status e motivo de pausa de todas as equipes continuam visíveis.
    expect(proj.agentes.map((a) => a.status)).toEqual(p.agentes.map((a) => a.status));
    expect(proj.agentes.filter((a) => a.pausa).every((a) => a.pausa!.motivo)).toBe(true);
  });

  it('tv não recebe cliente nem motivo de pausa', async () => {
    const p = await painelCompleto();
    expect(p.agentes.some((a) => a.pausa)).toBe(true);
    const proj = projetarPainel(p, { perfil: 'tv', equipe: null });
    painelSchema.parse(proj);
    for (const a of proj.agentes) {
      expect(a.atendimento).toBeUndefined();
      if (a.pausa) expect(a.pausa).toEqual({ limiteSeg: expect.any(Number), totalDiaSeg: 60 });
    }
    const json = JSON.stringify(proj);
    expect(json).not.toContain('motivo');
    expect(json).not.toContain('codigoCliente');
    expect(json).not.toContain('telefoneMascarado');
  });

  it('não altera o painel original', async () => {
    const p = await painelCompleto();
    const copia = structuredClone(p);
    projetarPainel(p, { perfil: 'tv', equipe: null });
    projetarPainel(p, { perfil: 'supervisor', equipe: 1 });
    expect(p).toEqual(copia);
  });
});
