// Vista do salão: 5 equipes de 8 baias (4 à esquerda, 4 à direita), numeradas da direita para a
// esquerda. A baia 1 de cada lado fica junto da mesa do supervisor (embaixo).
import {
  EQUIPES,
  ROTULO_STATUS,
  formatarDuracao,
  nivelPausa,
  segundosDesde,
  type Agente,
} from '@benheimdall/shared';
import { useUi } from '../hooks/useUi';

const POSICOES = [1, 2, 3, 4] as const;

function Baia({ a, visivel }: { a: Agente | undefined; visivel: boolean }) {
  const { agora, abrir, modoTv } = useUi();
  if (!a)
    return <div className="seat s-OFFLINE" style={{ opacity: 0.25, cursor: 'default' }} aria-hidden="true" />;

  let st: string = a.status;
  let linha = a.status === 'POS_ATENDIMENTO' ? 'Tabulando' : ROTULO_STATUS[a.status];
  if (a.status === 'PAUSA') {
    if (a.pausa && nivelPausa(segundosDesde(a.desde, agora), a.pausa.limiteSeg) === 'critico') st = 'CRIT';
    linha = a.pausa?.motivo ?? 'Pausa';
  }
  const partes = a.nome.split(' ');
  const curto = partes.length > 1 ? `${partes[0]} ${partes[partes.length - 1]![0]}.` : a.nome;

  return (
    <button
      type="button"
      className={`seat s-${st}`}
      data-id={a.id}
      style={visivel ? undefined : { opacity: 0.3 }}
      tabIndex={modoTv ? -1 : 0}
      onClick={() => abrir(a.id)}
      title={`${a.nome} · ${ROTULO_STATUS[a.status]} · baia ${a.lado === 'E' ? 'esquerda' : 'direita'} ${a.posicao}`}
    >
      <b>{curto}</b>
      <span>{a.status === 'OFFLINE' ? '—' : formatarDuracao(segundosDesde(a.desde, agora))}</span>
      <em>{linha}</em>
    </button>
  );
}

export function MapaSalao({ todos, visiveis }: { todos: Agente[]; visiveis: Agente[] }) {
  const ids = new Set(visiveis.map((a) => a.id));
  // Da esquerda para a direita na tela: equipe 5 … equipe 1.
  const equipes = [...EQUIPES].reverse();

  return (
    <section className="salao" aria-label="Mapa do salão">
      <p className="dir">
        Vista do salão do operacional. Equipes numeradas da direita para a esquerda; a baia 1 de cada lado
        fica junto da mesa do supervisor.
      </p>
      <div className="salao-scroll">
        <div className="floor">
          {equipes.map((eq) => {
            const membros = todos.filter((a) => a.equipe === eq);
            const livres = membros.filter((a) => a.status === 'LIVRE').length;
            const lado = (l: 'E' | 'D') =>
              POSICOES.map((p) => {
                const a = membros.find((m) => m.lado === l && m.posicao === p);
                return <Baia key={p} a={a} visivel={!!a && ids.has(a.id)} />;
              });
            return (
              <div className="team" key={eq}>
                <h3>
                  Equipe {eq}
                  <small>
                    {livres} livre{livres === 1 ? '' : 's'}
                  </small>
                </h3>
                <div className="sides">
                  <div>
                    <div className="side-l">Esquerda</div>
                    <div className="side">{lado('E')}</div>
                  </div>
                  <div>
                    <div className="side-l">Direita</div>
                    <div className="side">{lado('D')}</div>
                  </div>
                </div>
                <div className="sup">Mesa do supervisor</div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="legend">
        <span className="s-ATENDENDO">
          <i />
          Atendendo
        </span>
        <span className="s-POS_ATENDIMENTO">
          <i />
          Pós-atendimento
        </span>
        <span className="s-PAUSA">
          <i />
          Em pausa
        </span>
        <span className="s-CRIT">
          <i />
          Pausa acima do limite
        </span>
        <span className="s-LIVRE">
          <i />
          Livre
        </span>
        <span className="s-OFFLINE">
          <i />
          Offline
        </span>
      </div>
    </section>
  );
}
