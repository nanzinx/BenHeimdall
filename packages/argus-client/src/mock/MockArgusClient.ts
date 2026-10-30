// Argus simulada: 48 agentes (6 equipes × 8 baias, a 6 é a Digital) com transições realistas.
//
// A simulação avança em passos de 3 s, calculados a partir do relógio no momento de cada leitura,
// então não há timer próprio: quem dita o ritmo é o laço de leitura do servidor.
import type {
  AgenteBruto,
  ArgusClient,
  CallbacksBruto,
  ChamadaBruta,
  FilaBruta,
  MotivoPausaBruto,
  StatusNormalizado,
} from '../tipos';
import { ArgusIndisponivelError, ArgusRecusouError } from '../tipos';
import { CAMPANHAS, CLIENTES, DDDS, MOTIVOS_PAUSA, NOMES_AGENTES, SUPERVISORES } from './dados';

/** Códigos de status inventados para o simulador (de propósito, diferentes dos do painel). */
const STATUS_MOCK = {
  ATENDENDO: 'EM_ATENDIMENTO',
  POS_ATENDIMENTO: 'TABULACAO',
  PAUSA: 'PAUSA',
  LIVRE: 'DISPONIVEL',
  OFFLINE: 'DESLOGADO',
} as const satisfies Record<StatusNormalizado, string>;

const PASSO_MS = 3000;
const MAX_PASSOS_POR_LEITURA = 200;

interface AgenteSim {
  bruto: AgenteBruto;
  chamada: ChamadaBruta | null;
  statusSim: StatusNormalizado;
  desdeMs: number;
}

export interface MockArgusOpcoes {
  /** Semente do gerador pseudoaleatório; fixe em testes para ter resultados repetíveis. */
  semente?: number;
  /** Relógio injetável (testes). */
  agora?: () => number;
  /** Começa em falha (equivale a ARGUS_MOCK_FALHA=true). */
  falha?: boolean;
}

export class MockArgusClient implements ArgusClient {
  readonly modo = 'mock' as const;
  readonly mapaStatus: Readonly<Record<string, StatusNormalizado>> = Object.fromEntries(
    Object.entries(STATUS_MOCK).map(([painel, mock]) => [mock, painel as StatusNormalizado]),
  );

  private semente: number;
  private readonly agora: () => number;
  private readonly agentes: AgenteSim[];
  private ultimoPassoMs: number;
  private fila = 4;
  private callbacks = 3;
  /** `Infinity` = falha até ser restaurada; 0 = sem falha. */
  private falhaAteMs = 0;

  constructor(opcoes: MockArgusOpcoes = {}) {
    this.semente = opcoes.semente ?? (Date.now() % 2147483646) + 1;
    this.agora = opcoes.agora ?? Date.now;
    if (opcoes.falha) this.falhaAteMs = Infinity;
    this.ultimoPassoMs = this.agora();
    this.agentes = this.criarAgentes();
  }

  // ---------- controle de falha (modo de teste de queda) ----------

  /** Faz a Argus simulada falhar por `segundos` (ou até `restaurar()`, se omitido). */
  simularFalha(segundos?: number): void {
    this.falhaAteMs = segundos ? this.agora() + segundos * 1000 : Infinity;
  }

  restaurar(): void {
    this.falhaAteMs = 0;
  }

  get emFalha(): boolean {
    return this.agora() < this.falhaAteMs;
  }

  // ---------- ArgusClient ----------

  async listarAgentes(): Promise<AgenteBruto[]> {
    this.preparar();
    return this.agentes.map((a) => ({ ...a.bruto }));
  }

  async listarChamadasAtivas(): Promise<ChamadaBruta[]> {
    this.preparar();
    return this.agentes.flatMap((a) => (a.chamada ? [{ ...a.chamada }] : []));
  }

  async listarMotivosPausa(): Promise<MotivoPausaBruto[]> {
    this.preparar();
    return MOTIVOS_PAUSA.map((m) => ({ ...m }));
  }

  async obterFila(): Promise<FilaBruta> {
    this.preparar();
    return { emEspera: this.fila };
  }

  async obterCallbacks(): Promise<CallbacksBruto> {
    this.preparar();
    return { pendentes: this.callbacks };
  }

  /** Ramais em que o pop-up de transferência foi aberto (para conferir em testes). */
  readonly transferenciasAbertas: string[] = [];

  async abrirTransferencia(ramal: string): Promise<void> {
    if (this.emFalha) throw new ArgusIndisponivelError('Argus simulada fora do ar');
    const a = this.agentes.find((x) => x.bruto.ramal === ramal);
    if (!a) throw new ArgusRecusouError(`Ramal ${ramal} não encontrado.`);
    if (a.statusSim !== 'ATENDENDO') throw new ArgusRecusouError('Operador não está em atendimento.');
    this.transferenciasAbertas.push(ramal);
  }

  // ---------- simulação ----------

  private preparar(): void {
    this.avancar();
    if (this.emFalha) throw new ArgusIndisponivelError('Falha simulada da Argus (modo mock)');
  }

  private rnd(): number {
    this.semente = (this.semente * 16807) % 2147483647;
    return (this.semente - 1) / 2147483646;
  }

  private escolher<T>(lista: readonly T[]): T {
    return lista[Math.floor(this.rnd() * lista.length)] as T;
  }

  private criarAgentes(): AgenteSim[] {
    const agora = this.agora();
    return NOMES_AGENTES.map((nome, i) => {
      const equipe = Math.floor(i / 8) + 1;
      const n = i % 8;
      const atendimentos = 6 + Math.floor(this.rnd() * 22);
      const sim: AgenteSim = {
        bruto: {
          id: `ag${String(i + 1).padStart(2, '0')}`,
          nome,
          ramal: String(2101 + i),
          equipe,
          lado: n < 4 ? 'E' : 'D',
          posicao: ((n % 4) + 1) as 1 | 2 | 3 | 4,
          supervisor: SUPERVISORES[equipe - 1] ?? '',
          status: STATUS_MOCK.LIVRE,
          desde: new Date(agora).toISOString(),
          atendimentosDia: atendimentos,
          vendasDia: Math.floor(atendimentos * (0.04 + this.rnd() * 0.22)),
        },
        chamada: null,
        statusSim: 'LIVRE',
        desdeMs: agora,
      };
      const r = this.rnd();
      if (i === 13 || i === 30) this.mudar(sim, 'OFFLINE', agora);
      else if (r < 0.48) this.mudar(sim, 'ATENDENDO', agora - Math.floor(this.rnd() * 540_000));
      else if (r < 0.58) this.mudar(sim, 'POS_ATENDIMENTO', agora - Math.floor(this.rnd() * 40_000));
      else if (r < 0.75) this.mudar(sim, 'PAUSA', agora - Math.floor(this.rnd() * 1_100_000));
      else this.mudar(sim, 'LIVRE', agora - Math.floor(this.rnd() * 240_000));
      return sim;
    });
  }

  private mudar(a: AgenteSim, status: StatusNormalizado, desdeMs: number): void {
    a.statusSim = status;
    a.desdeMs = desdeMs;
    a.bruto.status = STATUS_MOCK[status];
    a.bruto.desde = new Date(desdeMs).toISOString();
    a.bruto.codigoPausa = status === 'PAUSA' ? this.escolher(MOTIVOS_PAUSA).codigo : undefined;
    if (status === 'ATENDENDO') a.chamada = this.novaChamada(a.bruto.id, desdeMs);
    // Em pós-atendimento a chamada continua associada (a campanha aparece em "Tabulando").
    if (status !== 'ATENDENDO' && status !== 'POS_ATENDIMENTO') a.chamada = null;
  }

  private novaChamada(agenteId: string, inicioMs: number): ChamadaBruta {
    const num = (digitos: number) =>
      Array.from({ length: digitos }, () => Math.floor(this.rnd() * 10)).join('');
    return {
      agenteId,
      nomeCliente: this.escolher(CLIENTES),
      telefone: `${this.escolher(DDDS)}9${num(8)}`,
      campanha: this.escolher(CAMPANHAS),
      inicio: new Date(inicioMs).toISOString(),
      // Campos sensíveis de propósito: o normalizador precisa descartá-los.
      cpf: `${num(3)}.${num(3)}.${num(3)}-${num(2)}`,
      beneficio: num(10),
      conta: `${num(4)}-${num(1)}`,
    };
  }

  private avancar(): void {
    const agora = this.agora();
    const passos = Math.min(MAX_PASSOS_POR_LEITURA, Math.floor((agora - this.ultimoPassoMs) / PASSO_MS));
    for (let k = passos - 1; k >= 0; k--) this.passo(agora - k * PASSO_MS);
    if (passos > 0) this.ultimoPassoMs = agora;
  }

  private passo(t: number): void {
    for (const a of this.agentes) {
      const decorrido = (t - a.desdeMs) / 1000;
      const r = this.rnd();
      switch (a.statusSim) {
        case 'LIVRE':
          if (r < 0.22) this.mudar(a, 'ATENDENDO', t);
          else if (r < 0.245) this.mudar(a, 'PAUSA', t);
          else if (r < 0.246) this.mudar(a, 'OFFLINE', t);
          break;
        case 'ATENDENDO':
          if (decorrido > 45 && r < 0.1) {
            a.bruto.atendimentosDia++;
            if (this.rnd() < 0.18) a.bruto.vendasDia++;
            this.mudar(a, 'POS_ATENDIMENTO', t);
          }
          break;
        case 'POS_ATENDIMENTO':
          if (decorrido > 12 && r < 0.35) this.mudar(a, 'LIVRE', t);
          break;
        case 'PAUSA':
          if (r < 0.015) this.mudar(a, 'LIVRE', t);
          break;
        case 'OFFLINE':
          if (r < 0.01) this.mudar(a, 'LIVRE', t);
          break;
      }
    }
    this.fila = Math.max(0, Math.min(14, this.fila + Math.round((this.rnd() - 0.5) * 3)));
    if (this.rnd() < 0.06)
      this.callbacks = Math.max(0, Math.min(10, this.callbacks + (this.rnd() < 0.5 ? -1 : 1)));
  }
}
