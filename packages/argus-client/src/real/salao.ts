// Equipes e baias. A Argus não tem "equipe": ela vem do grupo do operador (um por supervisor,
// como "GABRIEL - COMERCIAL", ou um grupo próprio, como "DIGITAL") e, se o grupo não disser
// (ex.: URA), do supervisor dele. As baias são distribuídas por ordem de ramal.
import { normalizarTexto } from './classificar';

export type Lado = 'E' | 'D';
export type Posicao = 1 | 2 | 3 | 4;
export interface Baia {
  lado: Lado;
  posicao: Posicao;
}

/** Uma equipe de config/equipes.json. */
export interface EquipeConfig {
  numero: number;
  /** Procurado como palavra inteira no grupo e depois no supervisor; também é o rótulo na tela. */
  nome: string;
  /** Outras palavras que identificam a equipe (opcional). */
  buscar?: string[];
}

export interface EquipeIdentificada {
  numero: number;
  nome: string;
}

/** "Gabriel" casa com "GABRIEL - COMERCIAL" e "Gabriel Souza", mas não com "GABRIELA". */
function contemPalavra(texto: string, palavra: string): boolean {
  const t = ` ${normalizarTexto(texto).replace(/[^a-z0-9]+/g, ' ')} `;
  const p = normalizarTexto(palavra)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return p.length > 0 && t.includes(` ${p} `);
}

const nomeCurto = (supervisor: string) => {
  const p = supervisor.trim().split(/\s+/)[0] ?? '';
  return p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1).toLocaleLowerCase('pt-BR');
};

/**
 * Identifica a equipe de cada operador.
 *  1. O grupo em que está (logado, ou o vinculado) cita uma equipe configurada → essa equipe.
 *  2. Senão, o nome do supervisor cita uma equipe configurada → essa equipe.
 *  3. Senão, o supervisor ganha um número novo depois das configuradas (em ordem alfabética).
 *  4. Sem supervisor → 0 ("Sem equipe").
 */
export function identificarEquipes(
  operadores: { ramal: string; grupo: string; supervisor: string }[],
  configuradas: EquipeConfig[] = [],
): Map<string, EquipeIdentificada> {
  const casa = (texto: string) =>
    texto
      ? configuradas.find((e) => [e.nome, ...(e.buscar ?? [])].some((p) => contemPalavra(texto, p)))
      : undefined;

  const resultado = new Map<string, EquipeIdentificada>();
  const semConfig: { ramal: string; supervisor: string }[] = [];
  for (const op of operadores) {
    const e = casa(op.grupo) ?? casa(op.supervisor);
    if (e) resultado.set(op.ramal, { numero: e.numero, nome: e.nome });
    else if (op.supervisor.trim()) semConfig.push(op);
    else resultado.set(op.ramal, { numero: 0, nome: '' });
  }

  // Supervisores fora da configuração: números novos, sem repetir os configurados.
  const usados = new Set(configuradas.map((e) => e.numero));
  const numeroDe = new Map<string, number>();
  let proximo = 1;
  const supervisores = [...new Set(semConfig.map((o) => o.supervisor.trim()))].sort((a, b) =>
    normalizarTexto(a).localeCompare(normalizarTexto(b)),
  );
  for (const s of supervisores) {
    while (usados.has(proximo)) proximo++;
    numeroDe.set(s, proximo);
    usados.add(proximo);
  }
  for (const op of semConfig) {
    const s = op.supervisor.trim();
    resultado.set(op.ramal, { numero: numeroDe.get(s)!, nome: nomeCurto(s) });
  }
  return resultado;
}

/** Ordem de ocupação: baias 1–4 da esquerda, depois 1–4 da direita. */
const BAIAS: Baia[] = (['E', 'D'] as const).flatMap((lado) =>
  ([1, 2, 3, 4] as const).map((posicao) => ({ lado, posicao })),
);

/**
 * Baia de cada ramal: as 8 baias da equipe, por ordem de ramal. Equipe com mais de 8 agentes:
 * os que sobram ficam sem baia (aparecem nas listas e no mapa, em "Sem baia definida").
 */
export function distribuirBaias(agentes: { ramal: string; equipe: number }[]): Map<string, Baia> {
  const resultado = new Map<string, Baia>();
  const porEquipe = new Map<number, string[]>();
  for (const a of agentes) porEquipe.set(a.equipe, [...(porEquipe.get(a.equipe) ?? []), a.ramal]);
  for (const ramais of porEquipe.values()) {
    ramais
      .sort((x, y) => x.localeCompare(y, undefined, { numeric: true }))
      .forEach((ramal, i) => {
        const b = BAIAS[i];
        if (b) resultado.set(ramal, b);
      });
  }
  return resultado;
}

const palavras = (s: string) =>
  normalizarTexto(s)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

/**
 * O operador é, na verdade, um supervisor (conta de operador do próprio supervisor, que fica
 * parada em pausa e atrapalha os números): o nome bate com o de algum supervisor da Argus, por
 * inteiro ou pelo primeiro e último nome ("Cahuan Ferreira" × "CAHUAN VASCONCELOS FERREIRA").
 */
export function criarDetectorDeSupervisor(supervisores: Iterable<string>): (nome: string) => boolean {
  const inteiros = new Set<string>();
  const pontas = new Set<string>();
  for (const s of supervisores) {
    const p = palavras(s);
    if (!p.length) continue;
    inteiros.add(p.join(' '));
    if (p.length > 1) pontas.add(`${p[0]} ${p.at(-1)}`);
  }
  return (nome) => {
    const p = palavras(nome);
    if (!p.length) return false;
    return inteiros.has(p.join(' ')) || (p.length > 1 && pontas.has(`${p[0]} ${p.at(-1)}`));
  };
}
