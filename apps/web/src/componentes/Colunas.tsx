// As três colunas operacionais: atendimentos em curso, em pausa e livres para transferência.
import {
  conversao,
  formatarDuracao,
  listarAtendimentos,
  listarLivres,
  listarPausas,
  nivelPausa,
  segundosDesde,
  type Agente,
  type Painel,
} from '@benheimdall/shared';
import { useUi } from '../hooks/useUi';
import { gravarOrdem } from '../hooks/useUi';

function useLinha(a: Agente) {
  const { abrir, modoTv, mudaram } = useUi();
  return {
    'data-id': a.id,
    tabIndex: modoTv ? -1 : 0,
    flash: mudaram.has(a.id) ? ' flash' : '',
    onClick: () => abrir(a.id),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        abrir(a.id);
      }
    },
  };
}

function LinhaAtendimento({ a }: { a: Agente }) {
  const { agora } = useUi();
  const { flash, ...props } = useLinha(a);
  const pos = a.status === 'POS_ATENDIMENTO';
  const at = a.atendimento;
  return (
    <li className={`row atend${pos ? ' em-pos' : ''}${flash}`} {...props}>
      <div className="who">
        <b>{a.nome}</b>
        <small>
          Equipe {a.equipe} · ramal {a.ramal}
        </small>
      </div>
      <div className="client">
        {pos ? (
          <span>
            <span className="pill pos">Tabulando</span>
          </span>
        ) : at?.codigoCliente ? (
          <span>
            <b className="cod">{at.codigoCliente}</b> {at.clienteMascarado}{' '}
            <span className="tel">· {at.telefoneMascarado}</span>
          </span>
        ) : (
          <span className="restr">Cliente de outra equipe</span>
        )}
        <small>{at?.campanha ?? ''}</small>
      </div>
      <div className="timer">
        {formatarDuracao(segundosDesde(a.desde, agora))}
        <small>
          {!pos && <span className="ao-vivo" aria-hidden="true" />}
          {pos ? 'pós-atend.' : 'em ligação'}
        </small>
      </div>
    </li>
  );
}

function LinhaPausa({ a, painel }: { a: Agente; painel: Painel }) {
  const { agora } = useUi();
  const { flash, ...props } = useLinha(a);
  const s = segundosDesde(a.desde, agora);
  const lim = a.pausa?.limiteSeg ?? 0;
  const nivel = nivelPausa(s, lim);
  // O total do dia vem calculado até atualizadoEm; soma o que passou desde então.
  const total = (a.pausa?.totalDiaSeg ?? 0) + segundosDesde(painel.atualizadoEm, agora);
  const classe = nivel === 'critico' ? ' crit' : nivel === 'alerta' ? ' warn' : '';
  return (
    <li className={`row pausa${classe}${flash}`} {...props}>
      <div className="who">
        <b>{a.nome}</b>
        <small>
          <span className="pill-motivo">
            {a.pausa?.motivo ? `${a.pausa.motivo} · ` : ''}limite {formatarDuracao(lim)} ·{' '}
          </span>
          total {formatarDuracao(total)}
        </small>
        <div className="bar">
          <i style={{ width: `${lim ? Math.min(100, (s / lim) * 100).toFixed(0) : 0}%` }} />
        </div>
      </div>
      <div className="timer">
        {formatarDuracao(s)}
        <small>{nivel === 'critico' ? `+${formatarDuracao(s - lim)} acima` : 'na pausa'}</small>
      </div>
    </li>
  );
}

function LinhaLivre({ a, pos }: { a: Agente; pos: number }) {
  const { agora } = useUi();
  const { flash, ...props } = useLinha(a);
  return (
    <li className={`row livre${flash}`} {...props}>
      <div className="who">
        <b>
          <span className="rank">{pos}</span>
          {a.nome}
        </b>
        <small>
          Equipe {a.equipe} · ramal {a.ramal} ·{' '}
          <span className="conv">
            conversão <b>{(conversao(a) * 100).toFixed(0)}%</b>
          </span>
        </small>
      </div>
      <div className="timer">
        {formatarDuracao(segundosDesde(a.desde, agora))}
        <small>livre há</small>
      </div>
    </li>
  );
}

export function Colunas({ painel, agentes }: { painel: Painel; agentes: Agente[] }) {
  const { agora, ordem, setOrdem } = useUi();
  const atend = listarAtendimentos(agentes);
  const pausas = listarPausas(agentes, agora);
  const livres = listarLivres(agentes, ordem);

  return (
    <section className="board">
      <div className="col col-atend s-ATENDENDO">
        <div className="col-h">
          <h2>Atendimentos em curso</h2>
          <span className="count">{atend.length}</span>
          <span className="hint">código · cliente · campanha · duração</span>
        </div>
        <ul className="list" aria-live="off">
          {atend.length ? (
            atend.map((a) => <LinhaAtendimento key={a.id} a={a} />)
          ) : (
            <li className="empty">Nenhum atendimento em curso neste filtro.</li>
          )}
        </ul>
      </div>

      <div className="col s-PAUSA">
        <div className="col-h">
          <h2>Em pausa</h2>
          <span className="count">{pausas.length}</span>
          <span className="hint">atual · total do dia</span>
        </div>
        <ul className="list">
          {pausas.length ? (
            pausas.map((a) => <LinhaPausa key={a.id} a={a} painel={painel} />)
          ) : (
            <li className="empty">Ninguém em pausa neste filtro.</li>
          )}
        </ul>
      </div>

      <div className="col s-LIVRE">
        <div className="col-h">
          <h2 title="Livres para transferência">Livres p/ transferência</h2>
          <span className="count">{livres.length}</span>
          <select
            aria-label="Ordenar livres"
            value={ordem}
            onChange={(e) => {
              const o = e.target.value === 'conversao' ? 'conversao' : 'ocioso';
              setOrdem(o);
              gravarOrdem(o);
            }}
          >
            <option value="ocioso">Mais ocioso primeiro</option>
            <option value="conversao">Melhor conversão</option>
          </select>
        </div>
        <ul className="list">
          {livres.length ? (
            livres.map((a, i) => <LinhaLivre key={a.id} a={a} pos={i + 1} />)
          ) : (
            <li className="empty">
              Nenhum agente livre agora. Os livres aparecem aqui assim que terminam a tabulação.
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}
