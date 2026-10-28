// Histórico de status em `status_eventos`. Cada mudança fecha o evento aberto e abre outro.
// O total de pausa do dia e a linha do tempo saem daqui, então sobrevivem a reinícios.
import type { EventoStatus, StatusAgente } from '@benheimdall/shared';
import type { Banco } from '../db/banco';
import type { StatusAtual } from './normalizador';

interface LinhaEvento {
  id: number;
  agente_id: string;
  status: StatusAgente;
  motivo: string | null;
  inicio: string;
  fim: string | null;
}

/** Meia-noite local (fuso do servidor) do dia de `agora`. */
export function inicioDoDia(agora: Date): Date {
  const d = new Date(agora);
  d.setHours(0, 0, 0, 0);
  return d;
}

const iso = (ms: number) => new Date(ms).toISOString();
const TOLERANCIA_INICIO_MS = 5000;

export class RegistroStatus {
  private readonly abertoStmt;
  private readonly inserirStmt;
  private readonly fecharStmt;
  private readonly doDiaStmt;
  private readonly doAgenteStmt;

  constructor(private readonly db: Banco) {
    this.abertoStmt = db.prepare<[string], LinhaEvento>(
      'SELECT * FROM status_eventos WHERE agente_id = ? AND fim IS NULL ORDER BY id DESC LIMIT 1',
    );
    this.inserirStmt = db.prepare(
      'INSERT INTO status_eventos (agente_id, status, motivo, inicio) VALUES (@agenteId, @status, @motivo, @inicio)',
    );
    this.fecharStmt = db.prepare('UPDATE status_eventos SET fim = ? WHERE id = ?');
    // Eventos que tocam o intervalo [início do dia, agora].
    this.doDiaStmt = db.prepare<[string, string], LinhaEvento>(
      `SELECT * FROM status_eventos
        WHERE status = 'PAUSA' AND inicio < ? AND (fim IS NULL OR fim > ?)`,
    );
    this.doAgenteStmt = db.prepare<[string, string, string], LinhaEvento>(
      `SELECT * FROM status_eventos
        WHERE agente_id = ? AND inicio < ? AND (fim IS NULL OR fim > ?)
        ORDER BY inicio, id`,
    );
  }

  /** Grava as mudanças de status desta leitura. Devolve quantos eventos novos foram abertos. */
  registrar(atuais: StatusAtual[], agora: Date): number {
    let novos = 0;
    const agoraMs = agora.getTime();
    this.db.transaction(() => {
      for (const s of atuais) {
        // O início nunca fica no futuro (relógios diferentes entre Argus e servidor).
        const inicioMs = Math.min(Date.parse(s.desde), agoraMs);
        const aberto = this.abertoStmt.get(s.agenteId);
        // Mesmo status com início a menos de 5 s do anterior é a mesma ocorrência: na Argus real o
        // início vem de "agora − tempoStatus" e varia alguns milissegundos a cada leitura.
        if (
          aberto &&
          aberto.status === s.status &&
          aberto.motivo === s.motivo &&
          Math.abs(Date.parse(aberto.inicio) - inicioMs) < TOLERANCIA_INICIO_MS
        )
          continue;
        if (aberto) {
          // Fecha no início do novo status, sem voltar para antes do início do evento aberto.
          const fimMs = Math.max(Date.parse(aberto.inicio), inicioMs);
          this.fecharStmt.run(iso(fimMs), aberto.id);
        }
        this.inserirStmt.run({
          agenteId: s.agenteId,
          status: s.status,
          motivo: s.motivo,
          inicio: iso(inicioMs),
        });
        novos++;
      }
    })();
    return novos;
  }

  /** Total de pausa de hoje por agente, em segundos, até `agora` (inclui a pausa em curso). */
  pausasDoDia(agora: Date): Map<string, number> {
    const iniDia = inicioDoDia(agora).getTime();
    const agoraMs = agora.getTime();
    const totais = new Map<string, number>();
    for (const e of this.doDiaStmt.all(iso(agoraMs), iso(iniDia))) {
      const ini = Math.max(Date.parse(e.inicio), iniDia);
      const fim = Math.min(e.fim ? Date.parse(e.fim) : agoraMs, agoraMs);
      if (fim > ini) totais.set(e.agente_id, (totais.get(e.agente_id) ?? 0) + (fim - ini) / 1000);
    }
    for (const [k, v] of totais) totais.set(k, Math.floor(v));
    return totais;
  }

  /** Atendimentos de hoje por agente: quantas vezes entrou em ATENDENDO desde a meia-noite. */
  atendimentosDoDia(agora: Date): Map<string, number> {
    const linhas = this.db
      .prepare<[string, string], { agente_id: string; n: number }>(
        `SELECT agente_id, COUNT(*) AS n FROM status_eventos
          WHERE status = 'ATENDENDO' AND inicio >= ? AND inicio <= ?
          GROUP BY agente_id`,
      )
      .all(inicioDoDia(agora).toISOString(), agora.toISOString());
    return new Map(linhas.map((l) => [l.agente_id, l.n]));
  }

  /** Linha do tempo de hoje do agente, recortada no início do dia. */
  linhaDoTempo(agenteId: string, agora: Date): EventoStatus[] {
    const iniDia = inicioDoDia(agora).getTime();
    return this.doAgenteStmt.all(agenteId, agora.toISOString(), iso(iniDia)).map((e) => ({
      status: e.status,
      ...(e.motivo ? { motivo: e.motivo } : {}),
      inicio: iso(Math.max(Date.parse(e.inicio), iniDia)),
      ...(e.fim ? { fim: e.fim } : {}),
    }));
  }
}
