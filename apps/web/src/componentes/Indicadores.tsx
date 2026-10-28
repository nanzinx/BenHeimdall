import clsx from 'clsx';
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

  const itens: { rotulo: string; valor: number; sub: string; status: string; classe?: string }[] = [
    { rotulo: 'Atendendo', valor: c.ATENDENDO, sub: 'em ligação agora', status: 'ATENDENDO' },
    { rotulo: 'Pós-atendimento', valor: c.POS_ATENDIMENTO, sub: 'tabulando', status: 'POS_ATENDIMENTO' },
    {
      rotulo: 'Em pausa',
      valor: c.PAUSA,
      sub: acima ? `${acima} acima do limite` : 'todas no limite',
      status: acima ? 'CRIT' : 'PAUSA',
      classe: acima ? 'alarme' : undefined,
    },
    { rotulo: 'Livres', valor: c.LIVRE, sub: 'prontos p/ transferência', status: 'LIVRE' },
    { rotulo: 'Offline', valor: c.OFFLINE, sub: 'deslogados', status: 'OFFLINE' },
  ];

  return (
    <section className="kpis" aria-label="Indicadores">
      {itens.map((i) => (
        <div key={i.rotulo} className={clsx('kpi', `s-${i.status}`, i.classe)}>
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
