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
  visto_em: string | null;
}

/** Meia-noite local (fuso do servidor) do dia de `agora`. */
export function inicioDoDia(agora: Date): Date {
  const d = new Date(agora);
  d.setHours(0, 0, 0, 0);
  return d;
}

const iso = (ms: number) => new Date(ms).toISOString();
const TOLERANCIA_INICIO_MS = 5000;
/**
 * Ao fechar um status, ele só vale até um pouco depois da última leitura que o viu. Sem isso, um
 * servidor parado com o agente em pausa somaria, ao religar, todo o tempo parado como pausa.
 */
const LACUNA_MS = 60_000;
/** Leitura falha que pode ser desfeita: só eventos abertos há poucos minutos. */
const JANELA_FALHA_MS = 5 * 60_000;

/** Até quando o evento aberto pode ter durado, pelo que as leituras viram. */
const limiteVisto = (e: LinhaEvento) => Date.parse(e.visto_em ?? e.inicio) + LACUNA_MS;

export class RegistroStatus {
  private readonly abertoStmt;
  private readonly inserirStmt;
  private readonly fecharStmt;
  private readonly vistoStmt;
  private readonly reabrirStmt;
  private readonly apagarStmt;
  private readonly depoisDeStmt;
  private readonly ultimoAteStmt;
  private readonly doDiaStmt;
  private readonly doAgenteStmt;

  constructor(private readonly db: Banco) {
    this.abertoStmt = db.prepare<[string], LinhaEvento>(
      'SELECT * FROM status_eventos WHERE agente_id = ? AND fim IS NULL ORDER BY id DESC LIMIT 1',
    );
    this.inserirStmt = db.prepare(
      `INSERT INTO status_eventos (agente_id, status, motivo, inicio, visto_em)
       VALUES (@agenteId, @status, @motivo, @inicio, @vistoEm)`,
    );
    this.vistoStmt = db.prepare('UPDATE status_eventos SET visto_em = ? WHERE id = ?');
    this.reabrirStmt = db.prepare('UPDATE status_eventos SET fim = NULL, visto_em = ? WHERE id = ?');
    this.apagarStmt = db.prepare('DELETE FROM status_eventos WHERE id = ?');
    this.depoisDeStmt = db.prepare<[string, string], LinhaEvento>(
      'SELECT * FROM status_eventos WHERE agente_id = ? AND inicio > ? ORDER BY id',
    );
    this.ultimoAteStmt = db.prepare<[string, string], LinhaEvento>(
      'SELECT * FROM status_eventos WHERE agente_id = ? AND inicio <= ? ORDER BY inicio DESC, id DESC LIMIT 1',
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
        let aberto = this.abertoStmt.get(s.agenteId);
        const mesmo = (e: LinhaEvento) => e.status === s.status && e.motivo === s.motivo;

        // A Argus diz que o status atual começou ANTES do evento aberto: o que veio no meio foi
        // leitura falha (ex.: /statusoperador respondeu "não logado" por um instante). Apaga esses
        // eventos recentes e retoma o anterior, em vez de contar a mesma pausa duas vezes.
        if (aberto && inicioMs < Date.parse(aberto.inicio) - TOLERANCIA_INICIO_MS) {
          const intrusos = this.depoisDeStmt.all(s.agenteId, iso(inicioMs));
          if (intrusos.every((e) => agoraMs - Date.parse(e.inicio) <= JANELA_FALHA_MS)) {
            for (const e of intrusos) this.apagarStmt.run(e.id);
            const anterior = this.ultimoAteStmt.get(s.agenteId, iso(inicioMs + TOLERANCIA_INICIO_MS));
            if (anterior && mesmo(anterior)) {
              this.reabrirStmt.run(iso(agoraMs), anterior.id);
              continue;
            }
            aberto = anterior?.fim === null ? anterior : undefined;
            if (anterior && anterior.fim !== null && Date.parse(anterior.fim) > inicioMs)
              this.fecharStmt.run(iso(Math.max(Date.parse(anterior.inicio), inicioMs)), anterior.id);
          }
        }

        // Mesma ocorrência? Na Argus real o início vem de "agora − tempoStatus", que oscila de uma
        // leitura para outra. Pausa, livre, pós e offline repetidos, vistos há pouco, são o mesmo
        // trecho. Já um ATENDENDO que recomeça depois da última leitura é ligação nova (conta no dia).
        const vistoMs = Date.parse(aberto?.visto_em ?? aberto?.inicio ?? '');
        if (
          aberto &&
          mesmo(aberto) &&
          (Math.abs(Date.parse(aberto.inicio) - inicioMs) < TOLERANCIA_INICIO_MS ||
            (s.status === 'ATENDENDO'
              ? inicioMs <= vistoMs + TOLERANCIA_INICIO_MS
              : agoraMs - vistoMs <= LACUNA_MS))
        ) {
          this.vistoStmt.run(iso(agoraMs), aberto.id);
          continue;
        }
        let inicioNovo = inicioMs;
        if (aberto) {
          // Fecha no início do novo status (ou pouco depois da última vez que foi visto, se houve
          // um intervalo sem leituras), sem voltar para antes do início do evento aberto.
          const fimMs = Math.max(Date.parse(aberto.inicio), Math.min(inicioMs, limiteVisto(aberto)));
          this.fecharStmt.run(iso(fimMs), aberto.id);
          // Eventos do mesmo agente nunca se sobrepõem.
          inicioNovo = Math.max(inicioMs, fimMs);
        }
        this.inserirStmt.run({
          agenteId: s.agenteId,
          status: s.status,
          motivo: s.motivo,
          inicio: iso(inicioNovo),
          vistoEm: iso(agoraMs),
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
    const trechos = new Map<string, [number, number][]>();
    for (const e of this.doDiaStmt.all(iso(agoraMs), iso(iniDia))) {
      const ini = Math.max(Date.parse(e.inicio), iniDia);
      const fim = Math.min(e.fim ? Date.parse(e.fim) : agoraMs, agoraMs);
      if (fim > ini) trechos.set(e.agente_id, [...(trechos.get(e.agente_id) ?? []), [ini, fim]]);
    }
    // Soma a união dos trechos: o mesmo tempo nunca conta duas vezes (inclusive em registros
    // antigos, gravados antes da correção das leituras falhas).
    const totais = new Map<string, number>();
    for (const [agente, lista] of trechos) {
      lista.sort((x, y) => x[0] - y[0]);
      let total = 0;
      let ate = -Infinity;
      for (const [ini, fim] of lista) {
        if (fim <= ate) continue;
        total += fim - Math.max(ini, ate);
        ate = fim;
      }
      totais.set(agente, Math.floor(total / 1000));
    }
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
    const linha: EventoStatus[] = [];
    for (const e of this.doAgenteStmt.all(agenteId, agora.toISOString(), iso(iniDia))) {
      // Trecho de duração zero (sobra de leitura falha) não aparece.
      if (e.fim && e.fim <= e.inicio) continue;
      const evento: EventoStatus = {
        status: e.status,
        ...(e.motivo ? { motivo: e.motivo } : {}),
        inicio: iso(Math.max(Date.parse(e.inicio), iniDia)),
        ...(e.fim ? { fim: e.fim } : {}),
      };
      // Mesmo status e motivo emendados (registros antigos repetidos): vira um trecho só. Com
      // intervalo entre eles (ex.: duas ligações), ficam separados.
      const ultimo = linha.at(-1);
      if (
        ultimo?.fim &&
        ultimo.status === evento.status &&
        ultimo.motivo === evento.motivo &&
        Date.parse(evento.inicio) - Date.parse(ultimo.fim) < TOLERANCIA_INICIO_MS
      ) {
        if (!evento.fim) delete ultimo.fim;
        else if (evento.fim > ultimo.fim) ultimo.fim = evento.fim;
        continue;
      }
      linha.push(evento);
    }
    return linha;
  }
}
