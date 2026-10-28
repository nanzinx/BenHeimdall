// Tipos de domínio compartilhados entre backend e frontend.

export type StatusAgente = 'ATENDENDO' | 'POS_ATENDIMENTO' | 'PAUSA' | 'LIVRE' | 'OFFLINE';
export type Perfil = 'admin' | 'supervisor' | 'tv';

export const STATUS_AGENTE: readonly StatusAgente[] = [
  'ATENDENDO',
  'POS_ATENDIMENTO',
  'PAUSA',
  'LIVRE',
  'OFFLINE',
];
export const PERFIS: readonly Perfil[] = ['admin', 'supervisor', 'tv'];

export const ROTULO_STATUS: Record<StatusAgente, string> = {
  ATENDENDO: 'Atendendo',
  POS_ATENDIMENTO: 'Pós-atendimento',
  PAUSA: 'Em pausa',
  LIVRE: 'Livre',
  OFFLINE: 'Offline',
};

export const ROTULO_PERFIL: Record<Perfil, string> = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  tv: 'Tela TV',
};

export const EQUIPES = [1, 2, 3, 4, 5] as const;

export interface PausaAgente {
  /** Ausente quando o perfil não pode ver o motivo (perfil tv). */
  motivo?: string;
  limiteSeg: number;
  /** Total de pausa no dia, incluindo a pausa em curso até `Painel.atualizadoEm`. */
  totalDiaSeg: number;
}

export interface AtendimentoAgente {
  /**
   * Os três campos de cliente são omitidos pela projeção quando o perfil não pode vê-los
   * (supervisor olhando outra equipe). A campanha e o início sempre vêm.
   */
  codigoCliente?: string;
  clienteMascarado?: string;
  telefoneMascarado?: string;
  campanha: string;
  inicio: string;
}

export interface Agente {
  id: string;
  nome: string;
  ramal: string;
  equipe: number;
  lado: 'E' | 'D';
  posicao: 1 | 2 | 3 | 4;
  supervisor: string;
  status: StatusAgente;
  /** ISO, início do status atual. */
  desde: string;
  pausa?: PausaAgente;
  atendimento?: AtendimentoAgente;
  dia: { atendimentos: number; vendas: number };
}

export interface Painel {
  /** Hora do servidor, usada para corrigir o relógio do navegador. */
  atualizadoEm: string;
  argusOnline: boolean;
  ultimaLeituraArgus: string;
  agentes: Agente[];
  filaEspera: number;
  callbacks: number;
}

/** Um trecho da linha do tempo do agente, vindo de `status_eventos`. */
export interface EventoStatus {
  status: StatusAgente;
  motivo?: string;
  inicio: string;
  /** Ausente no status em curso. */
  fim?: string;
}

export interface DetalheAgente {
  agenteId: string;
  linhaDoTempo: EventoStatus[];
  pausaTotalSeg: number;
}

export interface Saude {
  ok: boolean;
  argus: { modo: 'mock' | 'real'; online: boolean; ultimaLeitura: string | null; ultimoErro: string | null };
  banco: { ok: boolean };
  /** Rotas de simulação de queda disponíveis (modo mock fora de produção). */
  simulacao: boolean;
}

export interface UsuarioPublico {
  id: number;
  usuario: string;
  nome: string;
  perfil: Perfil;
  equipe: number | null;
  ativo: boolean;
  trocaSenha: boolean;
  ultimoAcesso: string | null;
}

export interface SessaoAtual {
  usuario: UsuarioPublico;
  /** Null para o perfil tv, que não expira. */
  expiraEm: string | null;
  sessaoMin: number;
}

export interface RegistroAcesso {
  id: number;
  em: string;
  usuario: string;
  evento: string;
  detalhe: string | null;
  ip: string | null;
}
