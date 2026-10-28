// Classificação do status da Argus (statusoperador.descricaoStatus) nos 5 status do painel.
// Os textos vêm do .env, com os mesmos nomes de variável e padrões do BenURA.
import type { StatusNormalizado } from '../tipos';

export interface TextosStatus {
  livre: string[];
  atendimento: string[];
  posAtendimento: string[];
  offline: string[];
}

export const TEXTOS_STATUS_PADRAO: TextosStatus = {
  livre: ['livre', 'disponivel'],
  atendimento: ['atendimento', 'em atendimento', 'falando', 'conversa'],
  posAtendimento: ['tabulando', 'tabulacao', 'pos atendimento', 'pos-atendimento', 'pos_atendimento'],
  offline: ['deslogado', 'offline', 'desconectado'],
};

/** Minúsculas, sem acento e sem espaços nas pontas: "Pós Atendimento" → "pos atendimento". */
export function normalizarTexto(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * @param status statusOperador da Argus, ou null quando o operador não está logado.
 * @returns o status do painel, ou o texto original quando ele não está em nenhuma lista
 *          (o normalizador avisa no log e trata como OFFLINE; basta incluir o texto no .env).
 */
export function classificarStatus(
  status: { descricaoStatus?: unknown; descricaoPausa?: unknown } | null,
  textos: TextosStatus,
): StatusNormalizado | string {
  if (!status) return 'OFFLINE';
  const d = normalizarTexto(status.descricaoStatus);
  const naLista = (lista: string[]) => lista.some((t) => normalizarTexto(t) === d);
  if (naLista(textos.offline)) return 'OFFLINE';
  // Pausa informada vale mais que o texto do status (a Argus pode dizer "Pausa" ou o nome dela).
  if (normalizarTexto(status.descricaoPausa) || d.startsWith('pausa')) return 'PAUSA';
  if (naLista(textos.atendimento)) return 'ATENDENDO';
  if (naLista(textos.posAtendimento)) return 'POS_ATENDIMENTO';
  if (naLista(textos.livre)) return 'LIVRE';
  return String(status.descricaoStatus ?? '').trim() || 'DESCONHECIDO';
}
