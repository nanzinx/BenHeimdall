import { contarPorStatus, nivelPausa, segundosDesde, type Agente } from '@benheimdall/shared';

/**
 * Indicadores de topo, contados sobre os agentes do filtro atual.
 * Fila de espera e callbacks continuam no Painel, mas saíram da tela a pedido da operação:
 * não são necessários para a visualização dos supervisores.
 */
export function Indicadores({ agentes, agora }: { agentes: Agente[]; agora: number }) {
  const c = contarPorStatus(agentes);
  const acima = agentes.filter(
    (a) =>
      a.status === 'PAUSA' &&
      a.pausa &&
      nivelPausa(segundosDesde(a.desde, agora), a.pausa.limiteSeg) === 'critico',
  ).length;

  const itens: { rotulo: string; valor: number; sub: string; cor: string; classe?: string }[] = [
    { rotulo: 'Atendendo', valor: c.ATENDENDO, sub: 'em ligação agora', cor: 'var(--st-atend)' },
    { rotulo: 'Pós-atendimento', valor: c.POS_ATENDIMENTO, sub: 'tabulando', cor: 'var(--st-pos)' },
    {
      rotulo: 'Em pausa',
      valor: c.PAUSA,
      sub: acima ? `${acima} acima do limite` : 'todas no limite',
      cor: acima ? 'var(--st-crit)' : 'var(--st-pausa)',
      classe: acima ? 'alarme' : undefined,
    },
    { rotulo: 'Livres', valor: c.LIVRE, sub: 'prontos p/ transferência', cor: 'var(--st-livre)' },
    { rotulo: 'Offline', valor: c.OFFLINE, sub: 'deslogados', cor: 'var(--st-off)' },
  ];

  return (
    <section className="kpis" aria-label="Indicadores">
      {itens.map((i) => (
        <div
          key={i.rotulo}
          className={`kpi ${i.classe ?? ''}`}
          style={{ '--c': i.cor } as React.CSSProperties}
        >
          <span className="lab">{i.rotulo}</span>
          {/* A chave muda com o valor: o número "salta" quando muda. */}
          <span className="val" key={i.valor}>
            {i.valor}
          </span>
          <span className="sub">{i.sub}</span>
        </div>
      ))}
    </section>
  );
}
