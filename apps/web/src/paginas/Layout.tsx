// Moldura das telas logadas: topo, aviso da Argus, indicadores, filtros, a vista atual e o detalhe.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useNavigate, useOutletContext } from 'react-router-dom';
import type { Agente, OrdemLivres, Painel } from '@benheimdall/shared';
import { AvisoArgus } from '../componentes/AvisoArgus';
import { BarraFerramentas } from '../componentes/BarraFerramentas';
import { DetalheAgente } from '../componentes/DetalheAgente';
import { Indicadores } from '../componentes/Indicadores';
import { NotaSimulacao } from '../componentes/NotaSimulacao';
import { Topo } from '../componentes/Topo';
import { useAtividade } from '../hooks/useAtividade';
import { usePainel } from '../hooks/usePainel';
import { useRelogio } from '../hooks/useRelogio';
import { useSessao } from '../hooks/useSessao';
import { CtxUi, lerOrdem, type EstadoUi } from '../hooks/useUi';

export interface DadosVista {
  painel: Painel;
  agentes: Agente[];
}

export function useDadosVista() {
  return useOutletContext<DadosVista>();
}

/** Filtro por equipe e busca por nome, ramal ou código do cliente (quando visível ao perfil). */
export function filtrar(agentes: Agente[], equipe: number, busca: string): Agente[] {
  const q = busca.trim().toLowerCase();
  return agentes.filter(
    (a) =>
      (!equipe || a.equipe === equipe) &&
      (!q ||
        a.nome.toLowerCase().includes(q) ||
        a.ramal.includes(q) ||
        (a.atendimento?.codigoCliente?.includes(q) ?? false)),
  );
}

export function Layout() {
  const { sessao, sair, renovar, revalidar } = useSessao();
  const navegar = useNavigate();
  const usuario = sessao!.usuario;
  const { painel, offsetMs, mudaram } = usePainel();
  const agora = useRelogio(offsetMs);

  const [equipe, setEquipe] = useState(usuario.perfil === 'supervisor' ? (usuario.equipe ?? 0) : 0);
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<OrdemLivres>(lerOrdem);
  const [aberto, setAberto] = useState<string | null>(null);
  const modoTv = false;

  useAtividade(usuario.perfil !== 'tv', renovar);

  // O contador chegou a zero: confirma no servidor (que registra a expiração).
  const expirou = !!sessao?.expiraEm && agora >= Date.parse(sessao.expiraEm) + 1000;
  useEffect(() => {
    if (expirou) revalidar();
  }, [expirou, revalidar]);

  const fechar = useCallback(() => setAberto(null), []);
  const abrir = useCallback((id: string) => !modoTv && setAberto(id), [modoTv]);

  const ui = useMemo<EstadoUi>(
    () => ({
      equipe,
      setEquipe,
      busca,
      setBusca,
      ordem,
      setOrdem,
      aberto,
      abrir,
      fechar,
      modoTv,
      agora,
      mudaram,
    }),
    [equipe, busca, ordem, aberto, abrir, fechar, modoTv, agora, mudaram],
  );

  const agentes = useMemo(
    () => (painel ? filtrar(painel.agentes, equipe, busca) : []),
    [painel, equipe, busca],
  );

  const aoSair = () => void sair().then(() => navegar('/login', { replace: true }));

  return (
    <CtxUi.Provider value={ui}>
      <Topo painel={painel} agora={agora} sessao={sessao!} modoTv={modoTv} onSair={aoSair} />
      <main className="wrap">
        {!modoTv && usuario.perfil !== 'tv' && <NotaSimulacao />}
        <AvisoArgus painel={painel} agora={agora} />
        {painel ? (
          <>
            <Indicadores painel={painel} agentes={agentes} agora={agora} />
            {!modoTv && <BarraFerramentas admin={usuario.perfil === 'admin'} />}
            <Outlet context={{ painel, agentes } satisfies DadosVista} />
          </>
        ) : (
          <div className="splash">Carregando o painel…</div>
        )}
      </main>
      {!modoTv && <DetalheAgente painel={painel} />}
    </CtxUi.Provider>
  );
}
