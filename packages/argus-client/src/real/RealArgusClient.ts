// Cliente da Argus real, conforme a "Documentação API Argus" (doc-api-argus.pdf) e o cliente
// que o BenURA usa em produção (o BenHeimdall é independente dele; só segue as mesmas regras).
//
//  - Todo comando é POST {ARGUS_BASE_URL}/{comando} com o cabeçalho Token-Signature (doc 1).
//  - Erro de negócio vem com codStatus < 1 mesmo em HTTP 200. 403 = token recusado.
//  - 429 = a Argus pediu para desacelerar: as leituras pausam por alguns segundos.
//  - /statusoperador de quem não está logado responde HTTP 500: tratado como deslogado.
//
// A cada ciclo de leitura, uma única coleta (memorizada por 1 s) atende os 5 métodos do
// ArgusClient: diretório de operadores (/listarusuarios, em cache), grupos (/listargrupos, para
// tirar os operadores virtuais) e /statusoperador de cada ramal, com concorrência limitada.
import axios, { type AxiosInstance } from 'axios';
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
import { classificarStatus, TEXTOS_STATUS_PADRAO, type TextosStatus } from './classificar';
import { distribuirBaias, identificarEquipes, type EquipeConfig } from './salao';

export interface RealArgusOpcoes {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
  /** Timeout de cada /statusoperador (curto: são muitos por ciclo). */
  timeoutStatusMs?: number;
  /** Quantos /statusoperador ao mesmo tempo. */
  concorrencia?: number;
  textosStatus?: TextosStatus;
  /** Só operadores destas campanhas (vazio = todos). */
  campanhasIds?: number[];
  /** Equipes do salão (config/equipes.json): identificadas pelo grupo e pelo supervisor. */
  equipes?: EquipeConfig[];
  pausaLimiteMs?: number;
  cacheDiretorioMs?: number;
  cacheGruposMs?: number;
  agora?: () => number;
  /** Só para testes: substitui o HTTP. Devolve { status, data } como o axios. */
  enviar?: (comando: string, corpo: object, timeoutMs: number) => Promise<{ status: number; data: unknown }>;
}

interface Operador {
  ramal: string;
  nome: string;
  supervisor: string;
  /** Grupo vinculado na Argus (ex.: "GABRIEL - COMERCIAL", "DIGITAL"). */
  grupo: string;
}

interface StatusOperador {
  idCampanha?: number;
  campanha?: string;
  idGrupo?: number;
  grupo?: string;
  nome?: string;
  ramal?: string;
  descricaoStatus?: string;
  descricaoPausa?: string;
  tempoStatus?: number;
  origemDerivacao?: string;
}

interface UltimoLead {
  dataHoraAberturaLead?: string;
  nomeCliente?: string;
  codCliente?: string;
  telefone?: string;
  // cpfCnpj também vem, mas nunca é lido nem repassado.
}

interface Leitura {
  agentes: AgenteBruto[];
  chamadas: ChamadaBruta[];
  pausas: string[];
}

/** A Argus pediu para desacelerar (HTTP 429). */
export class ArgusLimiteError extends ArgusIndisponivelError {
  constructor(readonly ateMs: number) {
    super(`Argus em pausa por limite de requisições até ${new Date(ateMs).toISOString()}`);
    this.name = 'ArgusLimiteError';
  }
}

const ESTAVEL_MS = 5000;

export class RealArgusClient implements ArgusClient {
  readonly modo = 'real' as const;
  readonly contaAtendimentosPeloHistorico = true;
  /** O próprio cliente classifica o status: os códigos já saem como os do painel. */
  readonly mapaStatus: Readonly<Record<string, StatusNormalizado>> = {
    ATENDENDO: 'ATENDENDO',
    POS_ATENDIMENTO: 'POS_ATENDIMENTO',
    PAUSA: 'PAUSA',
    LIVRE: 'LIVRE',
    OFFLINE: 'OFFLINE',
  };

  protected readonly http: AxiosInstance;
  private readonly o: Required<
    Pick<
      RealArgusOpcoes,
      | 'timeoutMs'
      | 'timeoutStatusMs'
      | 'concorrencia'
      | 'pausaLimiteMs'
      | 'cacheDiretorioMs'
      | 'cacheGruposMs'
    >
  > &
    RealArgusOpcoes;
  private readonly agora: () => number;
  private pausaAte = 0;
  private coleta: { em: number; promessa: Promise<Leitura> } | null = null;
  private diretorioCache: { em: number; operadores: Operador[] } | null = null;
  private virtuaisCache: { em: number; ramais: Set<string> } | null = null;
  /** Último status de cada ramal: estabiliza o "desde" e cobre falhas pontuais de um ramal. */
  private anteriores = new Map<string, { agente: AgenteBruto; chamada: ChamadaBruta | null; em: number }>();

  constructor(opcoes: RealArgusOpcoes) {
    this.o = {
      timeoutMs: 5000,
      timeoutStatusMs: 2500,
      concorrencia: 10,
      pausaLimiteMs: 5000,
      cacheDiretorioMs: 5 * 60_000,
      cacheGruposMs: 60_000,
      ...opcoes,
    };
    this.agora = opcoes.agora ?? Date.now;
    this.http = axios.create({
      baseURL: opcoes.baseUrl.replace(/\/+$/, ''),
      headers: { 'Token-Signature': opcoes.token, 'Content-Type': 'application/json' },
      // Os códigos HTTP são tratados aqui (403, 429, 500 têm significados próprios na Argus).
      validateStatus: () => true,
    });
  }

  // ---------- ArgusClient ----------

  async listarAgentes(): Promise<AgenteBruto[]> {
    return (await this.coletar()).agentes;
  }

  async listarChamadasAtivas(): Promise<ChamadaBruta[]> {
    return (await this.coletar()).chamadas;
  }

  async listarMotivosPausa(): Promise<MotivoPausaBruto[]> {
    return (await this.coletar()).pausas.map((p) => ({ codigo: p, descricao: p }));
  }

  // A API da Argus não tem fila de espera nem callbacks pendentes (e o painel não os mostra).
  async obterFila(): Promise<FilaBruta> {
    return { emEspera: 0 };
  }

  async obterCallbacks(): Promise<CallbacksBruto> {
    return { pendentes: 0 };
  }

  // ---------- ação: pop-up de transferência (doc 4.15) ----------

  async abrirTransferencia(ramal: string): Promise<void> {
    const { status, data } = await this.enviar('popuptransferencia', { ramal }, this.o.timeoutMs);
    const r = data as { codStatus?: number; descStatus?: string } | null;
    if (status >= 200 && status < 300 && r?.codStatus === 1) return;
    if (status === 403)
      throw new ArgusIndisponivelError('Argus recusou o token em /popuptransferencia (HTTP 403).');
    if (status === 429)
      throw new ArgusIndisponivelError('A Argus pediu para aguardar. Tente de novo em alguns segundos.');
    if (r?.descStatus) throw new ArgusRecusouError(r.descStatus);
    throw new ArgusIndisponivelError(`Argus /popuptransferencia respondeu HTTP ${status}`);
  }

  // ---------- HTTP ----------

  private async enviar(
    comando: string,
    corpo: object,
    timeoutMs: number,
  ): Promise<{ status: number; data: unknown }> {
    if (this.o.enviar) return this.o.enviar(comando, corpo, timeoutMs);
    try {
      const r = await this.http.post(`/${comando}`, corpo, { timeout: timeoutMs });
      return { status: r.status, data: r.data };
    } catch (err) {
      throw new ArgusIndisponivelError(`Argus /${comando} sem resposta: ${(err as Error).message}`, {
        cause: err,
      });
    }
  }

  /** Executa um comando e devolve o corpo com codStatus 1; 500 devolve null quando `nullEm500`. */
  private async comando(comando: string, corpo: object, timeoutMs: number, nullEm500 = false) {
    const { status, data } = await this.enviar(comando, corpo, timeoutMs);
    if (status === 403)
      throw new ArgusIndisponivelError(
        `Argus recusou o token em /${comando} (HTTP 403). Confira ARGUS_TOKEN (Configurações → Desenvolvedor → Acesso API).`,
      );
    if (status === 429) {
      this.pausaAte = this.agora() + this.o.pausaLimiteMs;
      throw new ArgusLimiteError(this.pausaAte);
    }
    if (status === 500 && nullEm500) return null;
    if (status < 200 || status >= 300)
      throw new ArgusIndisponivelError(`Argus /${comando} respondeu HTTP ${status}`);
    const r = data as { codStatus?: number; descStatus?: string } | null;
    if (r?.codStatus === 1) return r as Record<string, unknown>;
    if (nullEm500 && r?.codStatus !== -1) return null; // statusoperador: demais códigos = não logado
    throw new ArgusIndisponivelError(
      `Argus /${comando} recusou: ${r?.descStatus ?? `codStatus ${r?.codStatus}`}`,
    );
  }

  // ---------- diretório e grupos (com cache) ----------

  private async diretorio(): Promise<Operador[]> {
    const agora = this.agora();
    if (this.diretorioCache && agora - this.diretorioCache.em < this.o.cacheDiretorioMs)
      return this.diretorioCache.operadores;
    try {
      const r = await this.comando(
        'listarusuarios',
        { idTipoUsuario: 2, ativo: 'true' },
        Math.max(this.o.timeoutMs, 15_000),
      );
      const usuarios = Array.isArray(r?.usuarios) ? (r.usuarios as Record<string, unknown>[]) : [];
      const filtro = new Set(this.o.campanhasIds ?? []);
      const operadores: Operador[] = [];
      for (const u of usuarios) {
        const ramal = String(u.ramal ?? '').trim();
        if (!ramal || u.ativo === false) continue;
        const campanhas = Array.isArray(u.campanhas) ? (u.campanhas as Record<string, unknown>[]) : [];
        const daOperacao = filtro.size
          ? campanhas.filter((c) => filtro.has(Number(c.idCampanha)))
          : campanhas;
        if (filtro.size && !daOperacao.length) continue;
        const comSupervisor = daOperacao.find((c) => String(c.nomeUsuarioSupervisor ?? '').trim());
        operadores.push({
          ramal,
          nome: nomeProprio(String(u.nome ?? '').trim()) || `Ramal ${ramal}`,
          supervisor: String(comSupervisor?.nomeUsuarioSupervisor ?? '').trim(),
          grupo: String((comSupervisor ?? daOperacao[0])?.grupoUsuarioDesc ?? '').trim(),
        });
      }
      this.diretorioCache = { em: agora, operadores };
      return operadores;
    } catch (err) {
      // Sem a lista nova, segue com a anterior (o status de cada um continua sendo lido).
      if (this.diretorioCache) return this.diretorioCache.operadores;
      throw err;
    }
  }

  /** Ramais dos grupos virtuais (robôs): não entram no painel. */
  private async ramaisVirtuais(): Promise<Set<string>> {
    const agora = this.agora();
    if (this.virtuaisCache && agora - this.virtuaisCache.em < this.o.cacheGruposMs)
      return this.virtuaisCache.ramais;
    try {
      const r = await this.comando('listargrupos', {}, this.o.timeoutMs);
      const grupos = Array.isArray(r?.grupos) ? (r.grupos as Record<string, unknown>[]) : [];
      const ramais = new Set<string>();
      for (const g of grupos)
        if (Number(g.idTipoGrupo) !== 1 && Array.isArray(g.ramaisOperadores))
          for (const ramal of g.ramaisOperadores) ramais.add(String(ramal));
      this.virtuaisCache = { em: agora, ramais };
      return ramais;
    } catch (err) {
      if (this.virtuaisCache) return this.virtuaisCache.ramais;
      if (err instanceof ArgusLimiteError) throw err;
      return new Set(); // sem os grupos, ainda dá para mostrar todos os operadores
    }
  }

  // ---------- coleta do ciclo ----------

  private coletar(): Promise<Leitura> {
    const agora = this.agora();
    if (this.coleta && agora - this.coleta.em < 1000) return this.coleta.promessa;
    const promessa = this.coletarAgora();
    this.coleta = { em: agora, promessa };
    return promessa;
  }

  private async coletarAgora(): Promise<Leitura> {
    if (this.agora() < this.pausaAte) throw new ArgusLimiteError(this.pausaAte);

    const [operadoresTodos, virtuais] = await Promise.all([this.diretorio(), this.ramaisVirtuais()]);
    const operadores = operadoresTodos.filter((op) => !virtuais.has(op.ramal));

    let falhas = 0;
    let ultimaFalha: unknown = null;
    const resultados = await mapaLimitado(operadores, this.o.concorrencia, async (op) => {
      try {
        const r = await this.comando('statusoperador', { ramal: op.ramal }, this.o.timeoutStatusMs, true);
        return {
          op,
          status: (r?.statusOperador as StatusOperador | undefined) ?? null,
          lead: (r?.ultimoLead as UltimoLead | undefined) ?? null,
        };
      } catch (err) {
        if (err instanceof ArgusLimiteError) throw err;
        falhas++;
        ultimaFalha = err;
        return { op, falhou: true as const };
      }
    });
    if (operadores.length && falhas === operadores.length)
      throw ultimaFalha instanceof Error
        ? ultimaFalha
        : new ArgusIndisponivelError('Argus não respondeu ao /statusoperador');

    // Equipe: grupo em que está logado agora (ou o vinculado) e, se ele não disser, o supervisor.
    const equipes = identificarEquipes(
      resultados.map((r) => ({
        ramal: r.op.ramal,
        grupo: ('status' in r ? String(r.status?.grupo ?? '').trim() : '') || r.op.grupo,
        supervisor: r.op.supervisor,
      })),
      this.o.equipes,
    );
    const equipeDe = (op: Operador) => equipes.get(op.ramal) ?? { numero: 0, nome: '' };
    const baias = distribuirBaias(operadores.map((op) => ({ ramal: op.ramal, equipe: equipeDe(op).numero })));

    const agora = this.agora();
    const agentes: AgenteBruto[] = [];
    const chamadas: ChamadaBruta[] = [];
    const pausas = new Set<string>();
    const vistos = new Set<string>();

    for (const res of resultados) {
      const { op } = res;
      vistos.add(op.ramal);
      const anterior = this.anteriores.get(op.ramal);
      if ('falhou' in res) {
        // Falha pontual de um ramal: mantém o último status lido (por até 30 s).
        if (anterior && agora - anterior.em < 30_000) {
          agentes.push(anterior.agente);
          if (anterior.chamada) chamadas.push(anterior.chamada);
          if (anterior.agente.codigoPausa) pausas.add(anterior.agente.codigoPausa);
        }
        continue;
      }
      const { status, lead } = res;
      const classe = classificarStatus(status, this.o.textosStatus ?? TEXTOS_STATUS_PADRAO);
      const codigoPausa =
        classe === 'PAUSA' ? String(status?.descricaoPausa ?? '').trim() || 'Pausa' : undefined;

      // "Desde" = agora − tempoStatus. Mesmo status e mesma pausa: mantém o início anterior.
      const tempo = Number(status?.tempoStatus);
      let desdeMs = Number.isFinite(tempo) && tempo >= 0 ? agora - tempo : agora;
      const mesmo =
        anterior && anterior.agente.status === classe && anterior.agente.codigoPausa === codigoPausa;
      if (mesmo) {
        const antes = Date.parse(anterior.agente.desde);
        if (!Number.isFinite(tempo) || Math.abs(antes - desdeMs) < ESTAVEL_MS) desdeMs = antes;
      }

      const baia = baias.get(op.ramal);
      const agente: AgenteBruto = {
        id: op.ramal,
        nome: nomeProprio(String(status?.nome ?? '').trim()) || op.nome,
        ramal: op.ramal,
        equipe: equipeDe(op).numero,
        ...(equipeDe(op).nome ? { equipeNome: equipeDe(op).nome } : {}),
        ...(baia ? { lado: baia.lado, posicao: baia.posicao } : {}),
        supervisor: op.supervisor,
        status: classe,
        desde: new Date(desdeMs).toISOString(),
        ...(codigoPausa ? { codigoPausa } : {}),
        atendimentosDia: 0, // contados pelo histórico do BenHeimdall
        vendasDia: 0, // TODO(Fase 3): a venda é uma tabulação; falta o layout do relatório
      };
      if (codigoPausa) pausas.add(codigoPausa);

      let chamada: ChamadaBruta | null = null;
      if (classe === 'ATENDENDO' || classe === 'POS_ATENDIMENTO') {
        const aberturaMs = Date.parse(String(lead?.dataHoraAberturaLead ?? ''));
        chamada = {
          agenteId: op.ramal,
          ...(lead?.codCliente ? { codigoCliente: String(lead.codCliente).trim() } : {}),
          nomeCliente: String(lead?.nomeCliente ?? ''),
          telefone: String(lead?.telefone ?? ''),
          campanha: String(status?.campanha ?? '').trim(),
          inicio: new Date(Number.isFinite(aberturaMs) ? Math.min(aberturaMs, agora) : desdeMs).toISOString(),
        };
        chamadas.push(chamada);
      }
      agentes.push(agente);
      this.anteriores.set(op.ramal, { agente, chamada, em: agora });
    }
    for (const ramal of this.anteriores.keys()) if (!vistos.has(ramal)) this.anteriores.delete(ramal);

    return { agentes, chamadas, pausas: [...pausas] };
  }
}

const PARTICULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);

/** "ANA PAULA DA SILVA" → "Ana Paula da Silva". Nome já com minúsculas fica como veio. */
export function nomeProprio(nome: string): string {
  if (!nome || nome !== nome.toLocaleUpperCase('pt-BR')) return nome;
  return nome
    .toLocaleLowerCase('pt-BR')
    .split(/\s+/)
    .map((p, i) => (i > 0 && PARTICULAS.has(p) ? p : p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1)))
    .join(' ');
}

/** Promise.all com no máximo `limite` tarefas ao mesmo tempo, mantendo a ordem. */
async function mapaLimitado<T, R>(itens: T[], limite: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const resultados = new Array<R>(itens.length);
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < itens.length) {
      const i = proximo++;
      resultados[i] = await fn(itens[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador));
  return resultados;
}
