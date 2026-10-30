// Converte as respostas brutas da Argus em `Painel`: valida com Zod, traduz status, mascara
// dados de cliente e calcula os tempos. Só campos de uma lista fechada são copiados, então
// CPF, benefício, conta e qualquer outro campo extra da Argus nunca saem do backend.
import { z } from 'zod';
import {
  agenteBrutoSchema,
  callbacksBrutoSchema,
  chamadaBrutaSchema,
  filaBrutaSchema,
  motivoPausaBrutoSchema,
  type AgenteBruto,
  type ChamadaBruta,
  type MotivoPausaBruto,
  type StatusNormalizado,
} from '@benheimdall/argus-client';
import type { Agente, Painel, StatusAgente } from '@benheimdall/shared';
import { mascararTelefone, primeiroNome } from './mascaramento';

export interface RespostasArgus {
  agentes: unknown;
  chamadas: unknown;
  motivos: unknown;
  fila: unknown;
  callbacks: unknown;
}

export interface LeituraArgus {
  agentes: AgenteBruto[];
  chamadas: ChamadaBruta[];
  motivos: MotivoPausaBruto[];
  fila: number;
  callbacks: number;
}

const leituraSchema = z.object({
  agentes: z.array(agenteBrutoSchema),
  chamadas: z.array(chamadaBrutaSchema),
  motivos: z.array(motivoPausaBrutoSchema),
  fila: filaBrutaSchema,
  callbacks: callbacksBrutoSchema,
});

/** Valida as respostas brutas. Lança `ZodError` se a Argus mandar algo fora do esperado. */
export function validarLeitura(respostas: RespostasArgus): LeituraArgus {
  const r = leituraSchema.parse(respostas);
  return { ...r, fila: r.fila.emEspera, callbacks: r.callbacks.pendentes };
}

export interface LimitesPausa {
  padraoSeg: number;
  porMotivoSeg: Record<string, number>;
}

/** Status atual de um agente, como é gravado em `status_eventos`. */
export interface StatusAtual {
  agenteId: string;
  status: StatusAgente;
  motivo: string | null;
  desde: string;
}

/** Status desconhecido vira OFFLINE (decisão registrada no README) e é avisado no log. */
export function traduzirStatus(
  codigo: string,
  mapa: Readonly<Record<string, StatusNormalizado>>,
  aoDesconhecer?: (codigo: string) => void,
): StatusAgente {
  const s = mapa[codigo];
  if (s) return s;
  aoDesconhecer?.(codigo);
  return 'OFFLINE';
}

export function extrairStatus(
  leitura: LeituraArgus,
  mapa: Readonly<Record<string, StatusNormalizado>>,
  aoDesconhecer?: (codigo: string) => void,
): StatusAtual[] {
  const motivos = new Map(leitura.motivos.map((m) => [m.codigo, m.descricao]));
  return leitura.agentes.map((a) => {
    const status = traduzirStatus(a.status, mapa, aoDesconhecer);
    const motivo =
      status === 'PAUSA' ? (motivos.get(a.codigoPausa ?? '') ?? a.codigoPausa ?? 'Sem motivo') : null;
    return { agenteId: a.id, status, motivo, desde: a.desde };
  });
}

export interface ContextoNormalizacao {
  agora: Date;
  ultimaLeitura: Date;
  argusOnline: boolean;
  mapaStatus: Readonly<Record<string, StatusNormalizado>>;
  limites: LimitesPausa;
  /** Total de pausa do dia do agente até `agora`, calculado a partir de `status_eventos`. */
  pausaDiaSeg: (agenteId: string) => number;
  /** Número da equipe → nome (config/equipes.json), quando a leitura não traz o nome. */
  nomesEquipes?: Record<number, string>;
  /** Quando a Argus não informa, os atendimentos do dia vêm do histórico (status_eventos). */
  atendimentosDia?: (agenteId: string) => number;
  aoDesconhecerStatus?: (codigo: string) => void;
}

const semAcento = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

/**
 * Limite do motivo de pausa. Casa pelo início do nome, sem diferenciar maiúsculas nem acentos,
 * como no BenURA: "ALMOÇO 1" usa o limite de "Almoço". O mais específico (mais longo) vence.
 */
export function limiteDaPausa(motivo: string, limites: LimitesPausa): number {
  const m = semAcento(motivo);
  let melhor: { chave: string; seg: number } | null = null;
  for (const [chave, seg] of Object.entries(limites.porMotivoSeg)) {
    const c = semAcento(chave);
    if (c && m.startsWith(c) && (!melhor || c.length > melhor.chave.length)) melhor = { chave: c, seg };
  }
  return melhor?.seg ?? limites.padraoSeg;
}

export function normalizar(leitura: LeituraArgus, ctx: ContextoNormalizacao): Painel {
  const chamadas = new Map(leitura.chamadas.map((c) => [c.agenteId, c]));
  const status = new Map(
    extrairStatus(leitura, ctx.mapaStatus, ctx.aoDesconhecerStatus).map((s) => [s.agenteId, s]),
  );

  const agentes = leitura.agentes.map((a): Agente => {
    const st = status.get(a.id)!;
    const agente: Agente = {
      id: a.id,
      nome: a.nome,
      ramal: a.ramal,
      equipe: a.equipe,
      ...((a.equipeNome ?? ctx.nomesEquipes?.[a.equipe])
        ? { equipeNome: a.equipeNome ?? ctx.nomesEquipes?.[a.equipe] }
        : {}),
      ...(a.lado && a.posicao ? { lado: a.lado, posicao: a.posicao } : {}),
      supervisor: a.supervisor,
      status: st.status,
      desde: new Date(a.desde).toISOString(),
      dia: { atendimentos: ctx.atendimentosDia?.(a.id) ?? a.atendimentosDia, vendas: a.vendasDia },
    };

    if (st.status === 'PAUSA') {
      const motivo = st.motivo ?? 'Sem motivo';
      agente.pausa = {
        motivo,
        limiteSeg: limiteDaPausa(motivo, ctx.limites),
        totalDiaSeg: ctx.pausaDiaSeg(a.id),
      };
    }

    const c = chamadas.get(a.id);
    if (c && (st.status === 'ATENDENDO' || st.status === 'POS_ATENDIMENTO')) {
      agente.atendimento = {
        // Sem lead aberto (ou campo vazio), o dado simplesmente não vai.
        ...(c.nomeCliente.trim() ? { clienteMascarado: primeiroNome(c.nomeCliente) } : {}),
        ...(c.telefone.replace(/\D/g, '') ? { telefoneMascarado: mascararTelefone(c.telefone) } : {}),
        campanha: c.campanha,
        inicio: new Date(c.inicio).toISOString(),
      };
    }
    return agente;
  });

  return {
    atualizadoEm: ctx.agora.toISOString(),
    argusOnline: ctx.argusOnline,
    ultimaLeituraArgus: ctx.ultimaLeitura.toISOString(),
    agentes,
    filaEspera: leitura.fila,
    callbacks: leitura.callbacks,
  };
}
