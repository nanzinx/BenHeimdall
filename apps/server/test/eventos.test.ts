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
    reg.registrar([st('PAUSA', as(10), 'Lanche')], as(10, 5)); // repetida: não grava de novo
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
    reg1.registrar([st('LIVRE', as(10, 20))], as(10, 20));
    reg1.registrar([st('PAUSA', as(11), 'Lanche')], as(11));
    db1.close();

    // "Reinício": novo processo, nova conexão, mesmo arquivo.
    const reg2 = new RegistroStatus(abrirBanco(arquivo));
    expect(reg2.pausasDoDia(as(11, 10)).get('ag01')).toBe(30 * 60);
    reg2.registrar([st('LIVRE', as(11, 12))], as(11, 12));
    expect(reg2.pausasDoDia(as(12)).get('ag01')).toBe(32 * 60);
  });

  it('pausa iniciada ontem só conta a partir da meia-noite', () => {
    const reg = new RegistroStatus(abrirBanco(':memory:'));
    const ontem = new Date(hoje.getTime() - 10 * 60 * 1000);
    reg.registrar([st('PAUSA', ontem, 'Particular')], ontem);
    expect(reg.pausasDoDia(as(0, 5)).get('ag01')).toBe(5 * 60);
  });
});
