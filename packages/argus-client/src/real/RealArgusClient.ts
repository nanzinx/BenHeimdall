// Cliente da Argus real — ESQUELETO.
//
// TODO(Fase 2): a documentação da API da Argus ainda não chegou. Este é o ÚNICO arquivo que precisa
// mudar para ligar o painel na Argus de verdade:
//   1. Preencher endpoints, autenticação e paginação em cada método (usando o `http` abaixo).
//   2. Converter cada resposta para o formato bruto de `../tipos.ts` (ou ajustar aqueles schemas).
//   3. Preencher `mapaStatus` com os nomes reais de status da Argus.
//   4. Confirmar se a chamada ativa traz o código do cliente ou se ele precisa ser cruzado pelo telefone.
// Nenhum endpoint foi inventado aqui de propósito.
import axios, { type AxiosInstance } from 'axios';
import type { ArgusClient, StatusNormalizado } from '../tipos';
import { NotImplementedError } from '../tipos';

export interface RealArgusOpcoes {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
}

const PENDENTE = 'Depende da documentação da API da Argus (Fase 2).';

export class RealArgusClient implements ArgusClient {
  readonly modo = 'real' as const;
  // TODO(Fase 2): mapear os códigos reais, por exemplo { '<código da Argus>': 'ATENDENDO', ... }.
  readonly mapaStatus: Readonly<Record<string, StatusNormalizado>> = {};

  protected readonly http: AxiosInstance;

  constructor(opcoes: RealArgusOpcoes) {
    this.http = axios.create({
      baseURL: opcoes.baseUrl,
      timeout: opcoes.timeoutMs ?? 5000,
      // TODO(Fase 2): confirmar o esquema de autenticação (Bearer, cabeçalho próprio, sessão...).
      headers: opcoes.token ? { Authorization: `Bearer ${opcoes.token}` } : {},
    });
  }

  async listarAgentes(): Promise<unknown> {
    // TODO(Fase 2): agentes logados com status atual, início do status e motivo de pausa.
    throw new NotImplementedError(`listarAgentes: ${PENDENTE}`);
  }

  async listarChamadasAtivas(): Promise<unknown> {
    // TODO(Fase 2): chamadas em curso por agente (cliente, telefone, campanha, início).
    throw new NotImplementedError(`listarChamadasAtivas: ${PENDENTE}`);
  }

  async listarMotivosPausa(): Promise<unknown> {
    // TODO(Fase 2): tabela de motivos de pausa (código → descrição).
    throw new NotImplementedError(`listarMotivosPausa: ${PENDENTE}`);
  }

  async obterFila(): Promise<unknown> {
    // TODO(Fase 2): clientes aguardando na fila.
    throw new NotImplementedError(`obterFila: ${PENDENTE}`);
  }

  async obterCallbacks(): Promise<unknown> {
    // TODO(Fase 2): callbacks pendentes.
    throw new NotImplementedError(`obterCallbacks: ${PENDENTE}`);
  }
}
