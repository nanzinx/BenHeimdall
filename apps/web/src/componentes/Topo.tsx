import clsx from 'clsx';
import {
  ROTULO_PERFIL,
  formatarDuracao,
  segundosDesde,
  type Painel,
  type SessaoAtual,
} from '@benheimdall/shared';
import { useTema } from '../hooks/useTema';

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
  onSair: () => void;
}

const IconeSol = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
const IconeLua = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z" />
  </svg>
);

export function Topo({ painel, agora, sessao, onSair }: Props) {
  const { usuario } = sessao;
  const { tema, alternar } = useTema();
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
        <div className={clsx('conn', !online && 'off')} role="status">
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
        <button
          className="btn-icone"
          type="button"
          onClick={alternar}
          aria-label={tema === 'escuro' ? 'Mudar para o modo claro' : 'Mudar para o modo escuro'}
          title={tema === 'escuro' ? 'Modo claro' : 'Modo escuro'}
        >
          {tema === 'escuro' ? <IconeSol /> : <IconeLua />}
        </button>
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
          {sessao.acessoLivre ? (
            // PC de desenvolvimento: sem login, sem expiração e sem Sair.
            <span className="sess" title="Sem login no PC (NODE_ENV=development); no servidor o login volta">
              acesso livre · PC
            </span>
          ) : (
            <>
              <span
                className={clsx('sess', restante !== null && restante < 60 && 'low')}
                title="Tempo até a sessão expirar sem uso"
              >
                {restante === null ? 'sem expiração' : `sessão ${formatarDuracao(restante)}`}
              </span>
              <button className="btn-top" type="button" onClick={onSair}>
                Sair
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
