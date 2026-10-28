import { describe, expect, it } from 'vitest';
import { MockArgusClient } from '@benheimdall/argus-client';
import { painelSchema } from '@benheimdall/shared';
import { normalizar, validarLeitura } from '../src/leitura/normalizador';
import { mascararTelefone, primeiroNome } from '../src/leitura/mascaramento';
import { LIMITES, lerMock } from './ajuda';

const agora = new Date('2026-03-02T15:00:00Z');

async function painelDoMock(semente = 11) {
  const mock = new MockArgusClient({ semente, agora: () => agora.getTime() });
  const leitura = await lerMock(mock);
  const chamadasBrutas = await mock.listarChamadasAtivas();
  const painel = normalizar(leitura, {
    agora,
    ultimaLeitura: agora,
    argusOnline: true,
    mapaStatus: mock.mapaStatus,
    limites: LIMITES,
    pausaDiaSeg: () => 123,
  });
  return { painel, chamadasBrutas };
}

describe('normalizador', () => {
  it('respostas do mock viram um Painel válido', async () => {
    const { painel } = await painelDoMock();
    expect(() => painelSchema.parse(painel)).not.toThrow();
    expect(painel.agentes).toHaveLength(40);
    const status = new Set(painel.agentes.map((a) => a.status));
    for (const s of ['ATENDENDO', 'PAUSA', 'LIVRE', 'OFFLINE']) expect(status).toContain(s);
  });

  it('agente em pausa recebe motivo, limite do motivo e total do dia', async () => {
    const { painel } = await painelDoMock();
    const emPausa = painel.agentes.filter((a) => a.status === 'PAUSA');
    expect(emPausa.length).toBeGreaterThan(0);
    for (const a of emPausa) {
      expect(a.pausa?.motivo).toBeTruthy();
      expect(a.pausa?.limiteSeg).toBe(LIMITES.porMotivoSeg[a.pausa!.motivo!]);
      expect(a.pausa?.totalDiaSeg).toBe(123);
    }
    expect(painel.agentes.filter((a) => a.status !== 'PAUSA').every((a) => !a.pausa)).toBe(true);
  });

  it('só quem está atendendo ou tabulando tem atendimento', async () => {
    const { painel } = await painelDoMock();
    for (const a of painel.agentes) {
      const emChamada = a.status === 'ATENDENDO' || a.status === 'POS_ATENDIMENTO';
      if (a.status === 'ATENDENDO') expect(a.atendimento).toBeDefined();
      if (!emChamada) expect(a.atendimento).toBeUndefined();
    }
  });

  it('status desconhecido vira OFFLINE e é avisado', () => {
    const avisos: string[] = [];
    const leitura = validarLeitura({
      agentes: [
        {
          id: 'x',
          nome: 'X',
          ramal: '1',
          equipe: 1,
          lado: 'E',
          posicao: 1,
          supervisor: 'S',
          status: 'CODIGO_NOVO',
          desde: agora.toISOString(),
          atendimentosDia: 0,
          vendasDia: 0,
        },
      ],
      chamadas: [],
      motivos: [],
      fila: { emEspera: 0 },
      callbacks: { pendentes: 0 },
    });
    const painel = normalizar(leitura, {
      agora,
      ultimaLeitura: agora,
      argusOnline: true,
      mapaStatus: {},
      limites: LIMITES,
      pausaDiaSeg: () => 0,
      aoDesconhecerStatus: (c) => avisos.push(c),
    });
    expect(painel.agentes[0]?.status).toBe('OFFLINE');
    expect(avisos).toEqual(['CODIGO_NOVO']);
  });

  it('rejeita resposta fora do formato', () => {
    expect(() =>
      validarLeitura({
        agentes: [{ id: 1 }],
        chamadas: [],
        motivos: [],
        fila: { emEspera: 0 },
        callbacks: { pendentes: 0 },
      }),
    ).toThrow();
  });
});

describe('mascaramento', () => {
  it('telefone vira (DDD) 9****-1234', () => {
    expect(mascararTelefone('11987651234')).toBe('(11) 9****-1234');
    expect(mascararTelefone('+55 (21) 98888-4321')).toBe('(21) 9****-4321');
    expect(mascararTelefone('1133334444')).toBe('(11) ****-4444');
    expect(mascararTelefone('123')).toBe('(**) ****-****');
  });

  it('só o primeiro nome do cliente', () => {
    expect(primeiroNome('MARIA das Graças Souza')).toBe('Maria');
    expect(primeiroNome('  josé  carlos ')).toBe('José');
  });

  it('nenhum campo sensível passa para o Painel', async () => {
    const { painel, chamadasBrutas } = await painelDoMock();
    const json = JSON.stringify(painel);
    expect(chamadasBrutas.length).toBeGreaterThan(0);
    for (const c of chamadasBrutas) {
      for (const sensivel of [c.cpf, c.beneficio, c.conta, c.telefone, c.nomeCliente]) {
        expect(typeof sensivel).toBe('string');
        expect(json).not.toContain(sensivel as string);
      }
    }
    for (const chave of ['cpf', 'beneficio', 'conta', 'telefone"', 'nomeCliente'])
      expect(json).not.toContain(chave);
    for (const a of painel.agentes.filter((x) => x.atendimento)) {
      expect(a.atendimento!.telefoneMascarado).toMatch(/^\(\d{2}\) 9\*{4}-\d{4}$/);
      expect(a.atendimento!.clienteMascarado).not.toContain(' ');
    }
  });
});
