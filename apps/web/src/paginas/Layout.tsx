// Moldura das telas logadas: topo, aviso da Argus, indicadores, filtros, a vista atual e o detalhe.
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useNavigate, useOutletContext } from 'react-router-dom';
import { equipesDoPainel, type Agente, type OrdemLivres, type Painel } from '@benheimdall/shared';
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
import { Colunas } from '../componentes/Colunas';
import { Entrada } from '../componentes/Entrada';
import { deveMostrarEntrada, diaDe, lerVistoEm, limparLogin, loginRecente, marcarVisto } from '../entrada';

export interface DadosVista {
  painel: Painel;
  agentes: Agente[];
}

export function useDadosVista() {
  return useOutletContext<DadosVista>();
}

/** Filtro por equipe e busca por nome do agente, ramal ou nome do cliente (quando visível ao perfil). */
/** Filtro "Todas" (o 0 é "Sem equipe"). */
export const TODAS = -1;

export function filtrar(agentes: Agente[], equipe: number, busca: string): Agente[] {
  const q = busca.trim().toLowerCase();
  return agentes.filter(
    (a) =>
      (equipe === TODAS || a.equipe === equipe) &&
      (!q ||
        a.nome.toLowerCase().includes(q) ||
        a.ramal.includes(q) ||
        (a.atendimento?.clienteMascarado?.toLowerCase().includes(q) ?? false)),
  );
}

export function Layout() {
  const { sessao, sair, renovar, revalidar } = useSessao();
  const navegar = useNavigate();
  const usuario = sessao!.usuario;
  const { painel, offsetMs, mudaram } = usePainel();
  const agora = useRelogio(offsetMs);

  const [equipe, setEquipe] = useState(
    usuario.perfil === 'supervisor' && usuario.equipe ? usuario.equipe : TODAS,
  );
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<OrdemLivres>(lerOrdem);
  const [aberto, setAberto] = useState<string | null>(null);
  // Modo TV: tela cheia, fonte maior, sem motivo de pausa e sem dados de cliente.
  // O perfil tv entra direto nele e não consegue sair (só pelo botão Sair).
  const [tvLigado, setTvLigado] = useState(false);
  const modoTv = usuario.perfil === 'tv' || tvLigado;

  // Entrada de boas-vindas: uma vez por dia e sempre logo depois do login (não no perfil tv).
  // Ao abrir o círculo, o painel entra em cascata.
  const [hoje] = useState(() => diaDe(new Date()));
  const [entrada, setEntrada] = useState<'mostrar' | 'cascata' | 'pronto'>(() =>
    usuario.perfil !== 'tv' &&
    deveMostrarEntrada({ vistoEm: lerVistoEm(), hoje, acabouDeEntrar: loginRecente() })
      ? 'mostrar'
      : 'pronto',
  );
  const [entradaNaTela, setEntradaNaTela] = useState(entrada === 'mostrar');
  useEffect(() => {
    if (entrada === 'mostrar') marcarVisto(hoje);
    limparLogin();
    // Só na montagem: a decisão já foi tomada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (entrada !== 'cascata') return undefined;
    const id = setTimeout(() => setEntrada('pronto'), 1200);
    return () => clearTimeout(id);
  }, [entrada]);

  useEffect(() => {
    document.body.classList.toggle('tv', modoTv);
    if (modoTv) setAberto(null);
    return () => document.body.classList.remove('tv');
  }, [modoTv]);

  const alternarTv = () => {
    const ligar = !tvLigado;
    setTvLigado(ligar);
    if (ligar) void document.documentElement.requestFullscreen?.().catch(() => undefined);
    else if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  };

  // Saída do modo TV: Esc, o botão que aparece ao mexer o mouse, ou sair da tela cheia.
  useEffect(() => {
    if (!tvLigado) return undefined;
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && setTvLigado(false);
    const aoSairDaTelaCheia = () => !document.fullscreenElement && setTvLigado(false);
    document.addEventListener('keydown', aoTeclar);
    document.addEventListener('fullscreenchange', aoSairDaTelaCheia);
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.removeEventListener('fullscreenchange', aoSairDaTelaCheia);
    };
  }, [tvLigado]);

  useAtividade(usuario.perfil !== 'tv' && !sessao?.acessoLivre, renovar);

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
      <Topo painel={painel} agora={agora} sessao={sessao!} onSair={aoSair} />
      {entradaNaTela && (
        <Entrada
          painel={painel}
          nome={usuario.id ? usuario.nome : null}
          aoSair={() => setEntrada('cascata')}
          aoTerminar={() => setEntradaNaTela(false)}
        />
      )}
      <main className={clsx('wrap', entrada === 'cascata' && 'cascata')}>
        {!modoTv && usuario.perfil !== 'tv' && <NotaSimulacao />}
        <AvisoArgus painel={painel} agora={agora} />
        {painel ? (
          <>
            <Indicadores agentes={agentes} agora={agora} />
            {!modoTv && (
              <BarraFerramentas
                onModoTv={alternarTv}
                admin={usuario.perfil === 'admin'}
                equipes={equipesDoPainel(painel.agentes)}
              />
            )}
            {/* No modo TV a vista é sempre o painel (as abas ficam escondidas). */}
            {modoTv ? (
              <Colunas painel={painel} agentes={agentes} />
            ) : (
              <Outlet context={{ painel, agentes } satisfies DadosVista} />
            )}
          </>
        ) : (
          <div className="splash">Carregando o painel…</div>
        )}
      </main>
      {!modoTv && <DetalheAgente painel={painel} />}
      {tvLigado && (
        <button className="sair-tv" type="button" onClick={alternarTv}>
          Sair do modo TV <kbd>Esc</kbd>
        </button>
      )}
    </CtxUi.Provider>
  );
}
