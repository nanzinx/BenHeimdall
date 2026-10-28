// Equipes e baias. A Argus não sabe onde cada um senta: a equipe vem do supervisor do
// operador (como no BenURA, um grupo por supervisor) e a baia vem de config/baias.json
// ou, sem ele, é distribuída por ordem de ramal.
import { normalizarTexto } from './classificar';

export type Lado = 'E' | 'D';
export type Posicao = 1 | 2 | 3 | 4;
export interface Baia {
  lado: Lado;
  posicao: Posicao;
}

/** Ordem de ocupação automática: baias 1–4 da esquerda, depois 1–4 da direita. */
const BAIAS: Baia[] = (['E', 'D'] as const).flatMap((lado) =>
  ([1, 2, 3, 4] as const).map((posicao) => ({ lado, posicao })),
);

const chaveSupervisor = (nome: string) => normalizarTexto(nome).replace(/\s+/g, ' ').toUpperCase();

/**
 * Número de cada equipe pelo nome do supervisor. O arquivo (config/equipes.json) manda; quem
 * não estiver nele recebe o próximo número livre, em ordem alfabética. Sem supervisor = 0.
 */
export function numerarEquipes(
  supervisores: string[],
  fixas: Record<string, number> = {},
): Map<string, number> {
  const resultado = new Map<string, number>();
  const fixasNorm = new Map(Object.entries(fixas).map(([nome, n]) => [chaveSupervisor(nome), n]));
  const usados = new Set<number>(fixasNorm.values());
  const nomes = [...new Set(supervisores.filter((s) => s.trim()))].sort((a, b) =>
    chaveSupervisor(a).localeCompare(chaveSupervisor(b)),
  );
  let proximo = 1;
  for (const nome of nomes) {
    const fixa = fixasNorm.get(chaveSupervisor(nome));
    if (fixa !== undefined) {
      resultado.set(nome, fixa);
      continue;
    }
    while (usados.has(proximo)) proximo++;
    resultado.set(nome, proximo);
    usados.add(proximo);
  }
  return resultado;
}

/**
 * Baia de cada ramal. As do arquivo (config/baias.json) ficam onde estão; os demais ocupam as
 * baias livres da equipe por ordem de ramal. Equipe com mais de 8 agentes: os que sobram ficam
 * sem baia (aparecem nas listas e no mapa, em "Sem baia definida").
 */
export function distribuirBaias(
  agentes: { ramal: string; equipe: number }[],
  fixas: Record<string, Baia> = {},
): Map<string, Baia> {
  const resultado = new Map<string, Baia>();
  const porEquipe = new Map<number, { ramal: string }[]>();
  for (const a of agentes) porEquipe.set(a.equipe, [...(porEquipe.get(a.equipe) ?? []), a]);
  for (const membros of porEquipe.values()) {
    const ocupadas = new Set<string>();
    for (const { ramal } of membros) {
      const f = fixas[ramal];
      if (f) {
        resultado.set(ramal, f);
        ocupadas.add(`${f.lado}${f.posicao}`);
      }
    }
    const livres = BAIAS.filter((b) => !ocupadas.has(`${b.lado}${b.posicao}`));
    const semBaia = membros
      .filter(({ ramal }) => !fixas[ramal])
      .sort((x, y) => x.ramal.localeCompare(y.ramal, undefined, { numeric: true }));
    semBaia.forEach(({ ramal }, i) => {
      const b = livres[i];
      if (b) resultado.set(ramal, b);
    });
  }
  return resultado;
}
