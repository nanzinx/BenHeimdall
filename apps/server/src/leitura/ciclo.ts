// Laço único de leitura da Argus. Roda uma vez por processo, não importa quantos navegadores
// estejam abertos: a cada ciclo lê, valida, grava as mudanças de status, normaliza e avisa os
// ouvintes (Socket.IO). Se a Argus falhar, mantém o último Painel com argusOnline=false e tenta
// de novo com espera crescente, até 30 s.
import { EventEmitter } from 'node:events';
import type { ArgusClient } from '@benheimdall/argus-client';
import type { Painel } from '@benheimdall/shared';
import type { Log } from '../log';
import type { RegistroStatus } from './eventos';
import { extrairStatus, normalizar, validarLeitura, type LimitesPausa } from './normalizador';

export const ESPERA_MAX_MS = 30_000;

/** Espera antes da próxima tentativa: POLL_MS dobrando a cada falha seguida, até 30 s. */
export function esperaAposFalha(pollMs: number, falhasSeguidas: number): number {
  return Math.min(ESPERA_MAX_MS, pollMs * 2 ** Math.max(0, falhasSeguidas - 1));
}

export interface CicloOpcoes {
  argus: ArgusClient;
  registro: RegistroStatus;
  limites: LimitesPausa;
  pollMs: number;
  log: Log;
  agora?: () => Date;
}

export interface EventosCiclo {
  painel: [Painel];
}

export class CicloLeitura extends EventEmitter<EventosCiclo> {
  private painel: Painel;
  private timer: NodeJS.Timeout | null = null;
  private rodando = false;
  private falhasSeguidas = 0;
  private ultimoErro: string | null = null;
  private leuAlgumaVez = false;
  private readonly agora: () => Date;
  private readonly desconhecidos = new Set<string>();

  constructor(private readonly o: CicloOpcoes) {
    super();
    this.agora = o.agora ?? (() => new Date());
    const t = this.agora().toISOString();
    this.painel = {
      atualizadoEm: t,
      argusOnline: false,
      ultimaLeituraArgus: t,
      agentes: [],
      filaEspera: 0,
      callbacks: 0,
    };
  }

  /** Fotografia atual (sem projeção por perfil), com `atualizadoEm` na hora do servidor. */
  painelAtual(): Painel {
    return { ...this.painel, atualizadoEm: this.agora().toISOString() };
  }

  estado() {
    return {
      online: this.painel.argusOnline,
      ultimaLeitura: this.leuAlgumaVez ? this.painel.ultimaLeituraArgus : null,
      ultimoErro: this.ultimoErro,
      falhasSeguidas: this.falhasSeguidas,
    };
  }

  iniciar(): void {
    if (this.rodando) return;
    this.rodando = true;
    void this.laco();
  }

  parar(): void {
    this.rodando = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async laco(): Promise<void> {
    const ok = await this.executar();
    if (!this.rodando) return;
    const espera = ok ? this.o.pollMs : esperaAposFalha(this.o.pollMs, this.falhasSeguidas);
    this.timer = setTimeout(() => void this.laco(), espera);
  }

  /** Um ciclo de leitura. Público para os testes. Devolve se a Argus respondeu. */
  async executar(): Promise<boolean> {
    const { argus, registro, limites, log } = this.o;
    try {
      const [agentes, chamadas, motivos, fila, callbacks] = await Promise.all([
        argus.listarAgentes(),
        argus.listarChamadasAtivas(),
        argus.listarMotivosPausa(),
        argus.obterFila(),
        argus.obterCallbacks(),
      ]);
      const agora = this.agora();
      const leitura = validarLeitura({ agentes, chamadas, motivos, fila, callbacks });
      const avisar = (codigo: string) => {
        if (this.desconhecidos.has(codigo)) return;
        this.desconhecidos.add(codigo);
        log.warn({ codigo }, 'Status desconhecido da Argus, tratado como OFFLINE');
      };
      registro.registrar(extrairStatus(leitura, argus.mapaStatus, avisar), agora);
      const pausas = registro.pausasDoDia(agora);
      const atendimentos = argus.contaAtendimentosPeloHistorico ? registro.atendimentosDoDia(agora) : null;
      this.painel = normalizar(leitura, {
        agora,
        ultimaLeitura: agora,
        argusOnline: true,
        mapaStatus: argus.mapaStatus,
        limites,
        pausaDiaSeg: (id) => pausas.get(id) ?? 0,
        ...(atendimentos ? { atendimentosDia: (id: string) => atendimentos.get(id) ?? 0 } : {}),
      });
      if (this.falhasSeguidas > 0)
        log.info({ falhas: this.falhasSeguidas }, 'Conexão com a Argus restabelecida');
      this.falhasSeguidas = 0;
      this.ultimoErro = null;
      this.leuAlgumaVez = true;
      this.emit('painel', this.painel);
      return true;
    } catch (err) {
      this.falhasSeguidas++;
      this.ultimoErro = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      const proxima = esperaAposFalha(this.o.pollMs, this.falhasSeguidas);
      const nivel = this.falhasSeguidas === 1 ? 'error' : 'warn';
      log[nivel]({ err, falhas: this.falhasSeguidas, proximaTentativaMs: proxima }, 'Falha ao ler a Argus');
      this.painel = { ...this.painel, argusOnline: false, atualizadoEm: this.agora().toISOString() };
      this.emit('painel', this.painel);
      return false;
    }
  }
}
