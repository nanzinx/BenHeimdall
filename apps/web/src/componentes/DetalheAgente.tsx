import clsx from 'clsx';
// Painel lateral com o detalhe do agente: status atual, números do dia e linha do tempo.
import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ROTULO_STATUS,
  formatarDuracao,
  nivelPausa,
  rotuloEquipe,
  segundosDesde,
  type DetalheAgente as Detalhe,
  type Painel,
} from '@benheimdall/shared';
import { api } from '../api/cliente';
import { useSessao } from '../hooks/useSessao';
import { useUi } from '../hooks/useUi';
import { Transferir } from './Transferir';

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function DetalheAgente({ painel }: { painel: Painel | undefined }) {
  const { aberto, fechar, agora, modoTv } = useUi();
  const { sessao } = useSessao();
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
  // Transferir: admin em todos; supervisor só na própria equipe (o servidor confere de novo).
  const usuario = sessao?.usuario;
  const podeTransferir =
    !!a &&
    !modoTv &&
    a.status === 'ATENDENDO' &&
    (usuario?.perfil === 'admin' || (usuario?.perfil === 'supervisor' && usuario.equipe === a.equipe));
  // O dia inteiro, do mais recente para o mais antigo (zera à meia-noite).
  const linha = [...(detalhe.data?.linhaDoTempo ?? [])].reverse();

  let resumo = '';
  if (a) {
    const at = a.atendimento;
    if (a.status === 'ATENDENDO' && at)
      resumo = at.restrito
        ? `Cliente de outra equipe · ${at.campanha}`
        : [at.clienteMascarado ?? 'Cliente sem nome', at.telefoneMascarado, at.campanha]
            .filter(Boolean)
            .join(' · ');
    else if (a.status === 'POS_ATENDIMENTO' && at) resumo = `Tabulando · ${at.campanha}`;
    else resumo = `desde ${hhmm(a.desde)}`;
  }

  return (
    <>
      <div className={clsx('scrim', aberta && 'open')} onClick={fechar} />
      <aside
        className={clsx('drawer', aberta && 'open')}
        aria-label="Detalhe do agente"
        aria-hidden={!aberta}
      >
        <div className="drawer-h">
          <div>
            <h2>{a?.nome ?? 'Agente'}</h2>
            {a && (
              <p>
                {rotuloEquipe(a.equipe, a.equipeNome)}
                {a.supervisor ? ` · supervisor ${a.supervisor}` : ''}
                {a.lado ? ` · baia ${a.lado === 'E' ? 'esquerda' : 'direita'} ${a.posicao}` : ''} · ramal{' '}
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
            <div className={clsx('row', crit ? 's-CRIT' : `s-${a.status}`)}>
              <div className="who">
                <b>
                  {ROTULO_STATUS[a.status]}
                  {a.pausa?.motivo ? ` · ${a.pausa.motivo}` : ''}
                </b>
                <small>{resumo}</small>
              </div>
              <div className="timer">{formatarDuracao(s)}</div>
            </div>
            {podeTransferir && painel && <Transferir key={a.id} agente={a} agentes={painel.agentes} />}
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
                <b className="!text-[17px]">{formatarDuracao(pausaDia)}</b>
              </div>
            </div>
            <div>
              <div className="subhead !pl-0">
                Linha do tempo de hoje{linha.length ? ` · ${linha.length} trechos` : ''}
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
                      <small className="tl-dur">
                        {formatarDuracao(
                          Math.max(0, ((e.fim ? Date.parse(e.fim) : agora) - Date.parse(e.inicio)) / 1000),
                        )}
                      </small>
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
