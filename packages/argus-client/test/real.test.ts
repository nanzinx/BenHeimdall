// Cliente real contra respostas no formato da "Documentação API Argus" (seções 4.2, 4.3 e 4.14).
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ArgusIndisponivelError,
  ArgusLimiteError,
  RealArgusClient,
  agenteBrutoSchema,
  chamadaBrutaSchema,
  distribuirBaias,
  numerarEquipes,
  type RealArgusOpcoes,
} from '../src';

const AGORA = Date.parse('2026-10-28T15:00:00-03:00');

const usuario = (ramal: string, nome: string, supervisor: string, extra: object = {}) => ({
  idUsuario: Number(ramal),
  nome,
  login: nome.toLowerCase(),
  ramal,
  cpf: '111.222.333-44',
  email: `${ramal}@x`,
  ativo: true,
  idTipoUsuario: 2,
  campanhas: [
    { idCampanha: 7, campanhaDesc: 'Consignado', idGrupoUsuario: 1, nomeUsuarioSupervisor: supervisor },
  ],
  ...extra,
});

type Resp = { status: number; data: unknown };
function fakeArgus(status: Record<string, Resp>, opcoes: Partial<RealArgusOpcoes> = {}) {
  const chamadas: string[] = [];
  let agora = AGORA;
  const enviar = async (comando: string, corpo: object): Promise<Resp> => {
    chamadas.push(comando);
    if (comando === 'listarusuarios')
      return {
        status: 200,
        data: {
          codStatus: 1,
          usuarios: [
            usuario('2101', 'Ana Paula', 'MAYSA LIMA'),
            usuario('2102', 'Bruno', 'MAYSA LIMA'),
            usuario('2103', 'Carla', 'GABRIEL SOUZA'),
            usuario('2104', 'Diego', ''),
            usuario('9001', 'OPER VIRTUAL 1', ''),
          ],
        },
      };
    if (comando === 'listargrupos')
      return {
        status: 200,
        data: {
          codStatus: 1,
          grupos: [
            { idGrupoUsuario: 1, idTipoGrupo: 1, ramaisOperadores: ['2101', '2102', '2103', '2104'] },
            { idGrupoUsuario: 9, idTipoGrupo: 3, ramaisOperadores: ['9001'] },
          ],
        },
      };
    if (comando === 'statusoperador') {
      const ramal = (corpo as { ramal: string }).ramal;
      return status[ramal] ?? { status: 500, data: { codStatus: 0, descStatus: 'Operador não logado' } };
    }
    throw new Error(`comando inesperado ${comando}`);
  };
  const cliente = new RealArgusClient({
    baseUrl: 'https://argus.invalid/apiargus/cmd',
    token: 't',
    agora: () => agora,
    enviar,
    ...opcoes,
  });
  return { cliente, chamadas, avancar: (ms: number) => (agora += ms) };
}

const ok = (statusOperador: object, ultimoLead: object | null = null): Resp => ({
  status: 200,
  data: { codStatus: 1, statusOperador, ultimoLead },
});

describe('RealArgusClient', () => {
  const STATUS: Record<string, Resp> = {
    '2101': ok(
      {
        nome: 'ANA PAULA',
        campanha: 'Consignado',
        descricaoStatus: 'Em Atendimento',
        descricaoPausa: '',
        tempoStatus: 90_000,
      },
      {
        dataHoraAberturaLead: '2026-10-28T14:58:30-03:00',
        nomeCliente: 'MARIA DAS GRAÇAS',
        cpfCnpj: '123.456.789-00',
        codCliente: 'C-778',
        telefone: '11987651234',
      },
    ),
    '2102': ok({ nome: 'BRUNO', descricaoStatus: 'Pausa', descricaoPausa: 'ALMOÇO 1', tempoStatus: 600_000 }),
    '2103': ok({ nome: 'CARLA', descricaoStatus: 'Livre', descricaoPausa: '', tempoStatus: 30_000 }),
    // 2104 não logado: HTTP 500, como a Argus real responde
  };

  it('monta agentes e chamadas no formato bruto, sem robôs e sem CPF', async () => {
    const { cliente } = fakeArgus(STATUS);
    const agentes = z.array(agenteBrutoSchema).parse(await cliente.listarAgentes());
    const chamadas = z.array(chamadaBrutaSchema).parse(await cliente.listarChamadasAtivas());

    expect(agentes.map((a) => [a.ramal, a.status])).toEqual([
      ['2101', 'ATENDENDO'],
      ['2102', 'PAUSA'],
      ['2103', 'LIVRE'],
      ['2104', 'OFFLINE'],
    ]);
    const bruno = agentes.find((a) => a.ramal === '2102')!;
    expect(bruno.codigoPausa).toBe('ALMOÇO 1');
    expect(Date.parse(bruno.desde)).toBe(AGORA - 600_000);

    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]).toMatchObject({ agenteId: '2101', codigoCliente: 'C-778', campanha: 'Consignado' });
    expect(JSON.stringify(chamadas)).not.toContain('123.456.789-00');
    expect(JSON.stringify(agentes)).not.toContain('111.222.333-44');
    expect(await cliente.listarMotivosPausa()).toEqual([{ codigo: 'ALMOÇO 1', descricao: 'ALMOÇO 1' }]);
  });

  it('equipe por supervisor (ordem alfabética ou arquivo) e baias distribuídas', async () => {
    const { cliente } = fakeArgus(STATUS);
    const agentes = await cliente.listarAgentes();
    const eq = Object.fromEntries(agentes.map((a) => [a.ramal, a.equipe]));
    expect(eq).toEqual({ '2101': 2, '2102': 2, '2103': 1, '2104': 0 }); // GABRIEL=1, MAYSA=2, sem supervisor=0
    expect(agentes.find((a) => a.ramal === '2102')).toMatchObject({ lado: 'E', posicao: 2 });

    const fixo = fakeArgus(STATUS, {
      equipes: { 'Maysa Lima': 5 },
      baias: { '2102': { lado: 'D', posicao: 4 } },
    }).cliente;
    const comArquivo = await fixo.listarAgentes();
    expect(comArquivo.find((a) => a.ramal === '2101')).toMatchObject({ equipe: 5, lado: 'E', posicao: 1 });
    expect(comArquivo.find((a) => a.ramal === '2102')).toMatchObject({ equipe: 5, lado: 'D', posicao: 4 });
    expect(comArquivo.find((a) => a.ramal === '2103')?.equipe).toBe(1);
  });

  it('uma coleta por ciclo atende os métodos e o diretório fica em cache', async () => {
    const { cliente, chamadas, avancar } = fakeArgus(STATUS);
    await Promise.all([
      cliente.listarAgentes(),
      cliente.listarChamadasAtivas(),
      cliente.listarMotivosPausa(),
    ]);
    expect(chamadas.filter((c) => c === 'statusoperador')).toHaveLength(4);
    avancar(3000);
    await cliente.listarAgentes();
    expect(chamadas.filter((c) => c === 'statusoperador')).toHaveLength(8);
    expect(chamadas.filter((c) => c === 'listarusuarios')).toHaveLength(1);
  });

  it('o início do status não "anda" entre leituras do mesmo status', async () => {
    const status = { ...STATUS };
    const { cliente, avancar } = fakeArgus(status);
    const antes = (await cliente.listarAgentes()).find((a) => a.ramal === '2103')!.desde;
    avancar(3000);
    status['2103'] = ok({ nome: 'CARLA', descricaoStatus: 'Livre', tempoStatus: 33_040 }); // 40 ms de diferença
    const depois = (await cliente.listarAgentes()).find((a) => a.ramal === '2103')!.desde;
    expect(depois).toBe(antes);
  });

  it('403 vira erro de token; 429 vira pausa; todos falhando = Argus fora', async () => {
    const r403 = fakeArgus({}, {});
    const c403 = new RealArgusClient({
      baseUrl: 'x',
      token: 't',
      agora: () => AGORA,
      enviar: async () => ({ status: 403, data: {} }),
    });
    await expect(c403.listarAgentes()).rejects.toThrow(/token/);
    void r403;

    let n = 0;
    const c429 = new RealArgusClient({
      baseUrl: 'x',
      token: 't',
      agora: () => AGORA,
      enviar: async () => (n++ === 0 ? { status: 429, data: {} } : { status: 200, data: { codStatus: 1 } }),
    });
    await expect(c429.listarAgentes()).rejects.toBeInstanceOf(ArgusLimiteError);

    const { cliente } = fakeArgus(
      Object.fromEntries(['2101', '2102', '2103', '2104'].map((r) => [r, { status: 502, data: null }])),
    );
    await expect(cliente.listarAgentes()).rejects.toBeInstanceOf(ArgusIndisponivelError);
  });
});

describe('nomes', () => {
  it('nomes em maiúsculas viram nome próprio', async () => {
    const { nomeProprio } = await import('../src');
    expect(nomeProprio('ANA PAULA DA SILVA')).toBe('Ana Paula da Silva');
    expect(nomeProprio('João Reis')).toBe('João Reis');
  });
});

describe('equipes e baias', () => {
  it('numera supervisores sem repetir os números fixos', () => {
    const m = numerarEquipes(['ZECA', 'ANA', 'BIA', 'ANA'], { bia: 1 });
    expect(Object.fromEntries(m)).toEqual({ ANA: 2, BIA: 1, ZECA: 3 });
  });

  it('distribui até 8 baias por equipe; o resto fica sem baia', () => {
    const agentes = Array.from({ length: 10 }, (_, i) => ({ ramal: String(100 + i), equipe: 1 }));
    const b = distribuirBaias(agentes, { '109': { lado: 'E', posicao: 1 } });
    expect(b.get('109')).toEqual({ lado: 'E', posicao: 1 });
    expect(b.get('100')).toEqual({ lado: 'E', posicao: 2 });
    expect(b.size).toBe(8);
  });
});
