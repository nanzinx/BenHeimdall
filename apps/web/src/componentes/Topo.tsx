import {
  ROTULO_PERFIL,
  formatarDuracao,
  segundosDesde,
  type Painel,
  type SessaoAtual,
} from '@benheimdall/shared';

/** O olho de Heimdall: vigia o salão inteiro. */
export function Marca() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" stroke="#fff" />
      <circle cx="12" cy="12" r="3.2" fill="#F5C400" />
    </svg>
  );
}

const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

interface Props {
  painel: Painel | undefined;
  agora: number;
  sessao: SessaoAtual;
  modoTv: boolean;
  onModoTv?: () => void;
  onSair: () => void;
}

export function Topo({ painel, agora, sessao, modoTv, onModoTv, onSair }: Props) {
  const { usuario } = sessao;
  const online = painel?.argusOnline ?? false;
  const atraso = painel ? segundosDesde(painel.ultimaLeituraArgus, agora) : 0;
  const restante = sessao.expiraEm
    ? Math.max(0, Math.floor((Date.parse(sessao.expiraEm) - agora) / 1000))
    : null;

  return (
    <header className="top">
      <div className="wrap">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Marca />
          </span>
          <b>
            Ben<i>Heimdall</i>
          </b>
          <span>Painel de Atendimento</span>
        </div>
        <div className="spacer" />
        <div className={`conn${online ? '' : ' off'}`} role="status">
          <span className="dot" />
          <span>
            {!painel
              ? 'Conectando…'
              : online
                ? `Argus conectada · há ${atraso} s`
                : 'Sem conexão · reconectando'}
          </span>
        </div>
        <span className="clock">{new Date(agora).toLocaleTimeString('pt-BR')}</span>
        {usuario.perfil !== 'tv' && onModoTv && (
          <button className="btn-top" type="button" aria-pressed={modoTv} onClick={onModoTv}>
            Modo TV
          </button>
        )}
        <div className="userbox">
          <span className="avatar" aria-hidden="true">
            {iniciais(usuario.nome)}
          </span>
          <span className="quem">
            <b>{usuario.nome}</b>
            <span className="role">
              {ROTULO_PERFIL[usuario.perfil]}
              {usuario.perfil === 'supervisor' && usuario.equipe ? ` · Equipe ${usuario.equipe}` : ''}
            </span>
          </span>
          <span
            className={`sess mono${restante !== null && restante < 60 ? ' low' : ''}`}
            title="Tempo até a sessão expirar sem uso"
          >
            {restante === null ? 'sem expiração' : `sessão ${formatarDuracao(restante)}`}
          </span>
          <button className="btn-top" type="button" onClick={onSair}>
            Sair
          </button>
        </div>
      </div>
    </header>
  );
}
