import { describe, expect, it } from 'vitest';
import { deveMostrarEntrada, diaDe, primeiroNome, saudacao, valorNaContagem } from './entrada';

describe('entrada do painel', () => {
  it('saudação pela hora de Brasília', () => {
    expect(saudacao(new Date('2026-11-03T09:00:00-03:00'))).toBe('Bom dia');
    expect(saudacao(new Date('2026-11-03T14:00:00-03:00'))).toBe('Boa tarde');
    expect(saudacao(new Date('2026-11-03T20:00:00-03:00'))).toBe('Boa noite');
    expect(saudacao(new Date('2026-11-03T04:00:00-03:00'))).toBe('Boa noite');
  });

  it('primeiro nome com a inicial maiúscula', () => {
    expect(primeiroNome('RENAN LEITE')).toBe('Renan');
    expect(primeiroNome('  ')).toBeNull();
  });

  it('uma vez por dia, e sempre depois do login', () => {
    const hoje = diaDe(new Date('2026-11-03T12:00:00-03:00'));
    expect(hoje).toBe('2026-11-03');
    expect(deveMostrarEntrada({ vistoEm: null, hoje, acabouDeEntrar: false })).toBe(true);
    expect(deveMostrarEntrada({ vistoEm: hoje, hoje, acabouDeEntrar: false })).toBe(false);
    expect(deveMostrarEntrada({ vistoEm: hoje, hoje, acabouDeEntrar: true })).toBe(true);
    expect(deveMostrarEntrada({ vistoEm: '2026-11-02', hoje, acabouDeEntrar: false })).toBe(true);
  });

  it('a contagem vai de 0 até o valor e para nele', () => {
    expect(valorNaContagem(40, 0, 650)).toBe(0);
    expect(valorNaContagem(40, 325, 650)).toBeGreaterThan(20);
    expect(valorNaContagem(40, 650, 650)).toBe(40);
    expect(valorNaContagem(40, 9999, 650)).toBe(40);
  });
});
