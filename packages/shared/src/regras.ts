// Regras de apresentação usadas pelos dois lados: colunas do painel, faixas e formatação.
import type { Agente } from './tipos';

export type NivelPausa = 'normal' | 'alerta' | 'critico';
export type FaixaCallbacks = 'verde' | 'amarelo' | 'vermelho';
export type OrdemLivres = 'ocioso' | 'conversao';

export const CALLBACKS_TETO = 10;

/** Segundos decorridos desde `iso` até `agoraMs`, nunca negativo. */
export function segundosDesde(iso: string, agoraMs: number): number {
  return Math.max(0, Math.floor((agoraMs - Date.parse(iso)) / 1000));
}

/** 80% do limite vira alerta; 100% vira crítico. */
export function nivelPausa(decorridoSeg: number, limiteSeg: number): NivelPausa {
  if (limiteSeg <= 0) return 'normal';
  const razao = decorridoSeg / limiteSeg;
  if (razao >= 1) return 'critico';
  if (razao >= 0.8) return 'alerta';
  return 'normal';
}

/** Faixas dos callbacks: 0–1 verde, 2–5 amarelo, 6 em diante vermelho (teto 10). */
export function faixaCallbacks(n: number): FaixaCallbacks {
  if (n <= 1) return 'verde';
  if (n <= 5) return 'amarelo';
  return 'vermelho';
}

export function textoFaixaCallbacks(n: number): string {
  if (n <= 1) return 'ritmo agressivo';
  if (n <= 5) return 'alerta ao supervisor';
  if (n < CALLBACKS_TETO) return 'alerta ao gerente';
  return 'URA freada';
}

export function conversao(a: Pick<Agente, 'dia'>): number {
  return a.dia.atendimentos ? a.dia.vendas / a.dia.atendimentos : 0;
}

/** Formata segundos como mm:ss ou h:mm:ss. */
export function formatarDuracao(seg: number): string {
  const s = Math.max(0, Math.floor(seg));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const x = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(x)}` : `${p(m)}:${p(x)}`;
}

/** Atendimentos em curso: quem está em ligação e quem está tabulando, do mais antigo para o mais novo. */
export function listarAtendimentos(agentes: Agente[]): Agente[] {
  return agentes
    .filter((a) => a.status === 'ATENDENDO' || a.status === 'POS_ATENDIMENTO')
    .sort((x, y) => Date.parse(x.desde) - Date.parse(y.desde));
}

/** Em pausa, das mais próximas do limite (ou acima dele) para as mais recentes. */
export function listarPausas(agentes: Agente[], agoraMs: number): Agente[] {
  const razao = (a: Agente) => (a.pausa?.limiteSeg ? segundosDesde(a.desde, agoraMs) / a.pausa.limiteSeg : 0);
  return agentes.filter((a) => a.status === 'PAUSA').sort((x, y) => razao(y) - razao(x));
}

/**
 * Livres para transferência. Só entra quem está LIVRE: pós-atendimento (tabulação) nunca aparece aqui.
 */
export function listarLivres(agentes: Agente[], ordem: OrdemLivres): Agente[] {
  const livres = agentes.filter((a) => a.status === 'LIVRE');
  const maisAntigo = (x: Agente, y: Agente) => Date.parse(x.desde) - Date.parse(y.desde);
  return ordem === 'ocioso'
    ? livres.sort(maisAntigo)
    : livres.sort((x, y) => conversao(y) - conversao(x) || maisAntigo(x, y));
}

export function contarPorStatus(agentes: Agente[]): Record<Agente['status'], number> {
  const c = { ATENDENDO: 0, POS_ATENDIMENTO: 0, PAUSA: 0, LIVRE: 0, OFFLINE: 0 };
  for (const a of agentes) c[a.status]++;
  return c;
}

/** Equipes presentes no painel, em ordem, com o nome e o supervisor de cada uma (o mais frequente). */
export function equipesDoPainel(agentes: Agente[]): { equipe: number; nome: string; supervisor: string }[] {
  const mais = (m: Map<string, number>) => [...m.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? '';
  const porEquipe = new Map<number, { nomes: Map<string, number>; sups: Map<string, number> }>();
  for (const a of agentes) {
    const e = porEquipe.get(a.equipe) ?? { nomes: new Map(), sups: new Map() };
    if (a.equipeNome) e.nomes.set(a.equipeNome, (e.nomes.get(a.equipeNome) ?? 0) + 1);
    if (a.supervisor) e.sups.set(a.supervisor, (e.sups.get(a.supervisor) ?? 0) + 1);
    porEquipe.set(a.equipe, e);
  }
  return [...porEquipe.entries()]
    .sort(([x], [y]) => (x === 0 ? 1 : y === 0 ? -1 : x - y))
    .map(([equipe, e]) => {
      const supervisor = mais(e.sups);
      return { equipe, nome: mais(e.nomes) || primeiroNomeSupervisor(supervisor), supervisor };
    });
}

/** "Equipe 3 · Ariel", "Equipe 3" ou "Sem equipe". */
export function rotuloEquipe(equipe: number, nome?: string): string {
  if (!equipe) return 'Sem equipe';
  return nome ? `Equipe ${equipe} · ${nome}` : `Equipe ${equipe}`;
}

/** Primeiro nome do supervisor, para rótulos curtos ("GABRIEL SANTOS" → "Gabriel"). */
export function primeiroNomeSupervisor(nome: string): string {
  const p = nome.trim().split(/\s+/)[0] ?? '';
  return p ? p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1).toLocaleLowerCase('pt-BR') : '';
}
