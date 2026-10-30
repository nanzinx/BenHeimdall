import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { abrirBanco } from '../src/db/banco';
import { RegistroStatus, inicioDoDia } from '../src/leitura/eventos';
import type { StatusAtual } from '../src/leitura/normalizador';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'benheimdall-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

// Meio do dia local, para não cruzar a meia-noite.
const hoje = inicioDoDia(new Date());
const as = (h: number, m = 0, s = 0) => new Date(hoje.getTime() + ((h * 60 + m) * 60 + s) * 1000);
const ms = (d: Date, n: number) => new Date(d.getTime() + n);
const st = (status: StatusAtual['status'], desde: Date, motivo: string | null = null): StatusAtual => ({
  agenteId: 'ag01',
  status,
  motivo,
  desde: desde.toISOString(),
});

describe('status_eventos', () => {
  it('soma as pausas do dia, inclusive a pausa em curso', () => {
    const reg = new RegistroStatus(abrirBanco(':memory:'));
    reg.registrar([st('LIVRE', as(9))], as(9));
    reg.registrar([st('PAUSA', as(10), 'Lanche')], as(10, 0, 3));
    reg.registrar([st('PAUSA', as(10), 'Lanche')], as(10, 14, 59)); // repetida: não grava de novo
    reg.registrar([st('LIVRE', as(10, 15))], as(10, 15, 2));
    reg.registrar([st('PAUSA', as(11), 'Banheiro')], as(11));
    expect(reg.pausasDoDia(as(11, 4)).get('ag01')).toBe(15 * 60 + 4 * 60);
    expect(reg.linhaDoTempo('ag01', as(11, 4)).map((e) => e.status)).toEqual([
      'LIVRE',
      'PAUSA',
      'LIVRE',
      'PAUSA',
    ]);
  });

  it('o total de pausa do dia sobrevive a um reinício', () => {
    const arquivo = path.join(dir, 'teste.db');
    const db1 = abrirBanco(arquivo);
    const reg1 = new RegistroStatus(db1);
    reg1.registrar([st('PAUSA', as(10), 'Feedback')], as(10));
    reg1.registrar([st('PAUSA', as(10), 'Feedback')], as(10, 19, 57));
    reg1.registrar([st('LIVRE', as(10, 20))], as(10, 20));
    reg1.registrar([st('PAUSA', as(11), 'Lanche')], as(11));
    db1.close();

    // "Reinício": novo processo, nova conexão, mesmo arquivo.
    const reg2 = new RegistroStatus(abrirBanco(arquivo));
    expect(reg2.pausasDoDia(as(11, 10)).get('ag01')).toBe(30 * 60);
    reg2.registrar([st('PAUSA', as(11), 'Lanche')], as(11, 11, 58));
    reg2.registrar([st('LIVRE', as(11, 12))], as(11, 12));
    expect(reg2.pausasDoDia(as(12)).get('ag01')).toBe(32 * 60);
  });

  it('servidor parado com o agente em pausa não soma o tempo parado', () => {
    const arquivo = path.join(dir, 'parado.db');
    const reg1 = new RegistroStatus(abrirBanco(arquivo));
    reg1.registrar([st('PAUSA', as(8), 'Banheiro')], as(8));
    reg1.registrar([st('PAUSA', as(8), 'Banheiro')], as(8, 3)); // última leitura antes de parar

    // Religa às 11h: o agente está livre desde 10h, mas ninguém viu a pausa depois das 8h03.
    const reg2 = new RegistroStatus(abrirBanco(arquivo));
    reg2.registrar([st('LIVRE', as(10))], as(11));
    expect(reg2.pausasDoDia(as(11)).get('ag01')).toBe(4 * 60); // 8h00 até 8h03 + 1 min de folga
  });

  it('a mesma pausa continua depois de um reinício', () => {
    const arquivo = path.join(dir, 'continua.db');
    const reg1 = new RegistroStatus(abrirBanco(arquivo));
    reg1.registrar([st('PAUSA', as(9), 'Feedback')], as(9, 1));
    const reg2 = new RegistroStatus(abrirBanco(arquivo));
    reg2.registrar([st('PAUSA', as(9), 'Feedback')], as(9, 10));
    reg2.registrar([st('PAUSA', as(9), 'Feedback')], as(9, 11, 57));
    reg2.registrar([st('LIVRE', as(9, 12))], as(9, 12));
    expect(reg2.pausasDoDia(as(10)).get('ag01')).toBe(12 * 60);
  });

  it('pausa iniciada ontem só conta a partir da meia-noite', () => {
    const reg = new RegistroStatus(abrirBanco(':memory:'));
    const ontem = new Date(hoje.getTime() - 10 * 60 * 1000);
    reg.registrar([st('PAUSA', ontem, 'Particular')], ontem);
    expect(reg.pausasDoDia(as(0, 5)).get('ag01')).toBe(5 * 60);
  });
});

describe('leituras da Argus real', () => {
  it('"offline" de um instante no meio da pausa não duplica a pausa nem o total', () => {
    const reg = new RegistroStatus(abrirBanco(':memory:'));
    reg.registrar([st('LIVRE', as(13))], as(13));
    reg.registrar([st('PAUSA', as(13, 6), 'Digital')], as(13, 6, 2));
    reg.registrar([st('PAUSA', as(13, 6), 'Digital')], as(13, 37, 58));
    // Leitura falha: a Argus respondeu "não logado" por um instante.
    reg.registrar([st('OFFLINE', as(13, 38))], as(13, 38));
    reg.registrar([st('PAUSA', as(13, 6), 'Digital')], as(13, 38, 3));
    reg.registrar([st('OFFLINE', as(13, 38, 6))], as(13, 38, 6));
    reg.registrar([st('PAUSA', as(13, 6), 'Digital')], as(13, 38, 9));
    expect(reg.pausasDoDia(as(13, 40)).get('ag01')).toBe(34 * 60);
    expect(reg.linhaDoTempo('ag01', as(13, 40)).map((e) => e.status)).toEqual(['LIVRE', 'PAUSA']);
  });

  it('início que oscila mais de 5 s (tempoStatus da Argus) não abre evento repetido', () => {
    const db = abrirBanco(':memory:');
    const reg = new RegistroStatus(db);
    reg.registrar([st('PAUSA', as(12, 7), 'WPP')], as(12, 7, 1));
    reg.registrar([st('PAUSA', ms(as(12, 7), 9000), 'WPP')], as(12, 7, 4));
    reg.registrar([st('PAUSA', ms(as(12, 7), 2000), 'WPP')], as(12, 7, 7));
    expect(reg.linhaDoTempo('ag01', as(12, 8))).toHaveLength(1);
    expect(reg.pausasDoDia(as(12, 8)).get('ag01')).toBe(60);
    expect(db.prepare('SELECT COUNT(*) AS n FROM status_eventos').get()).toEqual({ n: 1 });
  });

  it('início que varia milissegundos entre leituras não abre evento novo; atendimentos do dia contados', () => {
    const reg = new RegistroStatus(abrirBanco(':memory:'));
    expect(reg.registrar([st('ATENDENDO', as(9))], as(9, 1))).toBe(1);
    expect(reg.registrar([st('ATENDENDO', ms(as(9), 40))], as(9, 1, 3))).toBe(0);
    reg.registrar([st('LIVRE', as(9, 5))], as(9, 5));
    reg.registrar([st('ATENDENDO', as(9, 6))], as(9, 6));
    expect(reg.atendimentosDoDia(as(10)).get('ag01')).toBe(2);
  });
});
