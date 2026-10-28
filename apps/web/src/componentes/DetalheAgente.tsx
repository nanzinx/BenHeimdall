// Painel lateral com o detalhe do agente: status atual, números do dia e linha do tempo.
import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ROTULO_STATUS,
  formatarDuracao,
  nivelPausa,
  segundosDesde,
  type DetalheAgente as Detalhe,
  type Painel,
} from '@benheimdall/shared';
import { api } from '../api/cliente';
import { useUi } from '../hooks/useUi';

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function DetalheAgente({ painel }: { painel: Painel | undefined }) {
  const { aberto, fechar, agora } = useUi();
  const botao = useRef<HTMLButtonElement>(null);
  const a = painel?.agentes.find((x) => x.id === aberto);

  const detalhe = useQuery({
    queryKey: ['agente', aberto],
    queryFn: () => api<Detalhe>(`/api/agentes/${encodeURIComponent(aberto!)}`),
    enabled: !!aberto,
    refetchInterval: 10_000,
  });

  useEffect(() => {
    if (!aberto) return;
    botao.current?.focus();
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && fechar();
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aberto, fechar]);

  const aberta = !!a;
  const s = a ? segundosDesde(a.desde, agora) : 0;
  const crit = a?.status === 'PAUSA' && a.pausa && nivelPausa(s, a.pausa.limiteSeg) === 'critico';
  const desdeAtualizacao = painel ? segundosDesde(painel.atualizadoEm, agora) : 0;
  const pausaDia =
    a?.status === 'PAUSA' && a.pausa
      ? a.pausa.totalDiaSeg + desdeAtualizacao
      : (detalhe.data?.pausaTotalSeg ?? 0);
  const linha = (detalhe.data?.linhaDoTempo ?? []).slice(-14).reverse();

  let resumo = '';
  if (a) {
    const at = a.atendimento;
    if (a.status === 'ATENDENDO' && at)
      resumo = at.codigoCliente
        ? `Cód. ${at.codigoCliente} · ${at.clienteMascarado} · ${at.telefoneMascarado} · ${at.campanha}`
        : `Cliente de outra equipe · ${at.campanha}`;
    else if (a.status === 'POS_ATENDIMENTO' && at) resumo = `Tabulando · ${at.campanha}`;
    else resumo = `desde ${hhmm(a.desde)}`;
  }

  return (
    <>
      <div className={`scrim${aberta ? ' open' : ''}`} onClick={fechar} />
      <aside
        className={`drawer${aberta ? ' open' : ''}`}
        aria-label="Detalhe do agente"
        aria-hidden={!aberta}
      >
        <div className="drawer-h">
          <div>
            <h2>{a?.nome ?? 'Agente'}</h2>
            {a && (
              <p>
                Equipe {a.equipe} · baia {a.lado === 'E' ? 'esquerda' : 'direita'} {a.posicao} · ramal{' '}
                {a.ramal}
              </p>
            )}
          </div>
          <button type="button" ref={botao} onClick={fechar}>
            Fechar
          </button>
        </div>
        {a && (
          <div className="drawer-b">
            <div
              className={`row s-${crit ? 'CRIT' : a.status}`}
              style={{ cursor: 'default', background: 'var(--tint)', borderColor: 'var(--c)' }}
            >
              <div className="who">
                <b>
                  {ROTULO_STATUS[a.status]}
                  {a.pausa?.motivo ? ` · ${a.pausa.motivo}` : ''}
                </b>
                <small>{resumo}</small>
              </div>
              <div className="timer">{formatarDuracao(s)}</div>
            </div>
            <div className="stats">
              <div className="stat">
                <small>Atendimentos</small>
                <b>{a.dia.atendimentos}</b>
              </div>
              <div className="stat">
                <small>Vendas</small>
                <b>{a.dia.vendas}</b>
              </div>
              <div className="stat">
                <small>Pausa no dia</small>
                <b className="mono" style={{ fontSize: 17 }}>
                  {formatarDuracao(pausaDia)}
                </b>
              </div>
            </div>
            <div>
              <div className="subhead" style={{ paddingLeft: 0 }}>
                Linha do tempo de hoje
              </div>
              {detalhe.isError ? (
                <p className="empty">Não foi possível carregar a linha do tempo.</p>
              ) : linha.length ? (
                <ul className="tl">
                  {linha.map((e) => (
                    <li key={e.inicio + e.status} className={`s-${e.status}`}>
                      <time>{hhmm(e.inicio)}</time>
                      <span className="d" />
                      <span>
                        {ROTULO_STATUS[e.status]}
                        {e.motivo ? ` · ${e.motivo}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty">{detalhe.isPending ? 'Carregando…' : 'Sem registros hoje.'}</p>
              )}
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
