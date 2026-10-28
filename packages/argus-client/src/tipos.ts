// Contrato entre o BenHeimdall e a Argus.
//
// ATENÇÃO: o formato "bruto" abaixo é PROVISÓRIO. A documentação da API da Argus ainda não chegou;
// estes schemas descrevem o que o MockArgusClient devolve e o mínimo de que o normalizador precisa.
// Na Fase 2, o RealArgusClient converte a resposta real para este formato (ou estes schemas
// são ajustados), sem mexer no restante do sistema.
import { z } from 'zod';

export const agenteBrutoSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(1),
  ramal: z.string().min(1),
  equipe: z.number().int().min(0).max(99),
  /** Rótulo da equipe na tela (ex.: "Gabriel", "Digital"). */
  equipeNome: z.string().optional(),
  lado: z.enum(['E', 'D']).optional(),
  posicao: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  supervisor: z.string(),
  /** Código de status como a Argus manda. Traduzido por `ArgusClient.mapaStatus`. */
  status: z.string().min(1),
  /** ISO, início do status atual. */
  desde: z.string().datetime({ offset: true }),
  /** Código do motivo de pausa, quando em pausa. Traduzido por `listarMotivosPausa()`. */
  codigoPausa: z.string().optional(),
  atendimentosDia: z.number().int().nonnegative(),
  vendasDia: z.number().int().nonnegative(),
});

export const chamadaBrutaSchema = z
  .object({
    agenteId: z.string().min(1),
    // TODO(Fase 2): confirmar se a chamada ativa da Argus traz o código do cliente
    // ou se ele precisa ser cruzado pelo telefone em outra base.
    codigoCliente: z.string().optional(),
    nomeCliente: z.string(),
    telefone: z.string(),
    campanha: z.string(),
    inicio: z.string().datetime({ offset: true }),
  })
  // Campos sensíveis (CPF, benefício, conta...) podem vir da Argus, mas são descartados
  // pelo normalizador e nunca saem do backend.
  .passthrough();

export const motivoPausaBrutoSchema = z.object({
  codigo: z.string().min(1),
  descricao: z.string().min(1),
});

export type AgenteBruto = z.infer<typeof agenteBrutoSchema>;
export type ChamadaBruta = z.infer<typeof chamadaBrutaSchema>;
export type MotivoPausaBruto = z.infer<typeof motivoPausaBrutoSchema>;

export type StatusNormalizado = 'ATENDENDO' | 'POS_ATENDIMENTO' | 'PAUSA' | 'LIVRE' | 'OFFLINE';

export interface ArgusClient {
  readonly modo: 'mock' | 'real';
  /**
   * Tradução dos códigos de status da Argus para os status do painel.
   * TODO(Fase 2): os nomes reais de status da Argus ainda não são conhecidos.
   */
  readonly mapaStatus: Readonly<Record<string, StatusNormalizado>>;
  listarAgentes(): Promise<unknown>;
  listarChamadasAtivas(): Promise<unknown>;
  listarMotivosPausa(): Promise<unknown>;
  /**
   * true quando a Argus não informa os atendimentos do dia por agente: o servidor conta pelo
   * próprio histórico (status_eventos).
   */
  readonly contaAtendimentosPeloHistorico?: boolean;
  obterFila(): Promise<unknown>;
  obterCallbacks(): Promise<unknown>;
}

/** A Argus não respondeu (rede, timeout, erro HTTP ou falha simulada). */
export class ArgusIndisponivelError extends Error {
  constructor(message = 'Argus indisponível', options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ArgusIndisponivelError';
  }
}

export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotImplementedError';
  }
}

// Fila e callbacks: formato provisório (TODO(Fase 2): confirmar com a documentação da Argus).
export const filaBrutaSchema = z.object({ emEspera: z.number().int().nonnegative() });
export const callbacksBrutoSchema = z.object({ pendentes: z.number().int().nonnegative() });
export type FilaBruta = z.infer<typeof filaBrutaSchema>;
export type CallbacksBruto = z.infer<typeof callbacksBrutoSchema>;
