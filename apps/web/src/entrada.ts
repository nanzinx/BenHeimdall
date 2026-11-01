// Regras da entrada do painel (componentes/Entrada.tsx): a saudação pela hora de Brasília, o
// primeiro nome de quem entrou e quando mostrar (uma vez por dia em cada navegador e sempre
// logo depois do login).

const FUSO = 'America/Sao_Paulo';
export const CHAVE_ENTRADA = 'benheimdall-entrada-vista-em';
const CHAVE_LOGIN = 'benheimdall-acabou-de-entrar';

const horaEm = (data: Date) =>
  Number(
    new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: 'numeric', hourCycle: 'h23' }).format(data),
  );

/** "2026-11-03" no fuso da operação. */
export const diaDe = (data: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: FUSO }).format(data);

export function saudacao(agora: Date = new Date()): 'Bom dia' | 'Boa tarde' | 'Boa noite' {
  const h = horaEm(agora);
  return h >= 5 && h < 12 ? 'Bom dia' : h >= 12 && h < 18 ? 'Boa tarde' : 'Boa noite';
}

export function primeiroNome(nome: string | null | undefined): string | null {
  const p = String(nome ?? '')
    .trim()
    .split(/\s+/)[0];
  return p ? p[0]!.toLocaleUpperCase('pt-BR') + p.slice(1).toLocaleLowerCase('pt-BR') : null;
}

export function deveMostrarEntrada(o: { vistoEm: string | null; hoje: string; acabouDeEntrar: boolean }) {
  return o.acabouDeEntrar || o.vistoEm !== o.hoje;
}

/** Os números contam de 0 até o valor em `duracaoMs` (rápido no começo, devagar no fim). */
export function valorNaContagem(ate: number, passadoMs: number, duracaoMs: number): number {
  const p = Math.min(1, Math.max(0, passadoMs / duracaoMs));
  return Math.round(ate * (1 - (1 - p) ** 3));
}

// localStorage/sessionStorage podem não existir (janela anônima, bloqueados): sem eles, mostra e segue.
function ler(armazem: () => Storage, chave: string): string | null {
  try {
    return armazem().getItem(chave);
  } catch {
    return null;
  }
}
function gravar(armazem: () => Storage, chave: string, valor: string | null): void {
  try {
    if (valor === null) armazem().removeItem(chave);
    else armazem().setItem(chave, valor);
  } catch {
    // sem armazenamento: aparece de novo na próxima vez, sem problema
  }
}

export const lerVistoEm = () => ler(() => localStorage, CHAVE_ENTRADA);
export const marcarVisto = (hoje: string) => gravar(() => localStorage, CHAVE_ENTRADA, hoje);

/** O login acabou de acontecer: marcado ao entrar, apagado quando a entrada já decidiu. */
export const marcarLogin = () => gravar(() => sessionStorage, CHAVE_LOGIN, '1');
export const loginRecente = () => ler(() => sessionStorage, CHAVE_LOGIN) === '1';
export const limparLogin = () => gravar(() => sessionStorage, CHAVE_LOGIN, null);
