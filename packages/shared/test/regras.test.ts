import { describe, expect, it } from 'vitest';
import type { Agente, StatusAgente } from '../src';
import { faixaCallbacks, formatarDuracao, listarLivres, nivelPausa } from '../src';

const agente = (id: string, status: StatusAgente, desde: string, atend = 10, vendas = 1): Agente => ({
  id,
  nome: id,
  ramal: '2100',
  equipe: 1,
  lado: 'E',
  posicao: 1,
  supervisor: 'Sup',
  status,
  desde,
  dia: { atendimentos: atend, vendas },
});

describe('lista de livres', () => {
  const agentes = [
    agente('livre-novo', 'LIVRE', '2026-01-01T10:05:00Z', 10, 1),
    agente('tabulando', 'POS_ATENDIMENTO', '2026-01-01T09:00:00Z', 10, 9),
    agente('livre-antigo', 'LIVRE', '2026-01-01T10:00:00Z', 10, 3),
    agente('atendendo', 'ATENDENDO', '2026-01-01T09:00:00Z'),
  ];

  it('pós-atendimento nunca aparece na lista de livres, em nenhuma ordem', () => {
    for (const ordem of ['ocioso', 'conversao'] as const) {
      const ids = listarLivres(agentes, ordem).map((a) => a.id);
      expect(ids).not.toContain('tabulando');
      expect(ids).not.toContain('atendendo');
    }
  });

  it('ordena por mais ocioso ou por conversão', () => {
    expect(listarLivres(agentes, 'ocioso').map((a) => a.id)).toEqual(['livre-antigo', 'livre-novo']);
    expect(listarLivres(agentes, 'conversao').map((a) => a.id)).toEqual(['livre-antigo', 'livre-novo']);
    const invertido = [
      agente('a', 'LIVRE', '2026-01-01T10:00:00Z', 10, 0),
      agente('b', 'LIVRE', '2026-01-01T10:05:00Z', 10, 5),
    ];
    expect(listarLivres(invertido, 'conversao').map((a) => a.id)).toEqual(['b', 'a']);
  });
});

describe('faixas e formatação', () => {
  it('callbacks: 0–1 verde, 2–5 amarelo, 6+ vermelho', () => {
    expect([0, 1, 2, 5, 6, 10].map(faixaCallbacks)).toEqual([
      'verde',
      'verde',
      'amarelo',
      'amarelo',
      'vermelho',
      'vermelho',
    ]);
  });

  it('pausa: alerta a 80% e crítico a 100%', () => {
    expect(nivelPausa(79, 100)).toBe('normal');
    expect(nivelPausa(80, 100)).toBe('alerta');
    expect(nivelPausa(100, 100)).toBe('critico');
  });

  it('duração', () => {
    expect(formatarDuracao(65)).toBe('01:05');
    expect(formatarDuracao(3725)).toBe('1:02:05');
  });
});

describe('login por e-mail', () => {
  it('sugere o nome a partir do e-mail', async () => {
    const { nomeDoEmail, novoUsuarioSchema } = await import('../src');
    expect(nomeDoEmail('renan.leite@benconsig.com')).toBe('Renan Leite');
    expect(nomeDoEmail('tv_salao@benconsig.com')).toBe('Tv Salao');
    const ok = novoUsuarioSchema.parse({
      nome: 'R',
      usuario: ' Renan.Leite@Benconsig.com ',
      perfil: 'admin',
    });
    expect(ok.usuario).toBe('renan.leite@benconsig.com');
    expect(() => novoUsuarioSchema.parse({ nome: 'R', usuario: 'renan', perfil: 'admin' })).toThrow();
  });
});
