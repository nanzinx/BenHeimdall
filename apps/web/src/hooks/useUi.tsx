// Estado de tela compartilhado entre as vistas: filtros, ordem dos livres, agente aberto e modo TV.
import { createContext, useContext } from 'react';
import type { OrdemLivres } from '@benheimdall/shared';

export interface EstadoUi {
  equipe: number; // -1 = todas; 0 = sem equipe
  setEquipe(n: number): void;
  busca: string;
  setBusca(s: string): void;
  ordem: OrdemLivres;
  setOrdem(o: OrdemLivres): void;
  aberto: string | null;
  abrir(id: string): void;
  fechar(): void;
  modoTv: boolean;
  /** Relógio corrigido pela hora do servidor (ms). */
  agora: number;
  mudaram: Set<string>;
}

export const CtxUi = createContext<EstadoUi | null>(null);

export function useUi(): EstadoUi {
  const c = useContext(CtxUi);
  if (!c) throw new Error('useUi fora do layout');
  return c;
}

const CHAVE_ORDEM = 'benheimdall-ordem';

export function lerOrdem(): OrdemLivres {
  try {
    const v = localStorage.getItem(CHAVE_ORDEM);
    return v === 'conversao' ? 'conversao' : 'ocioso';
  } catch {
    return 'ocioso';
  }
}

export function gravarOrdem(o: OrdemLivres) {
  try {
    localStorage.setItem(CHAVE_ORDEM, o);
  } catch {
    // Sem armazenamento local (janela privada): só não lembra a escolha.
  }
}
