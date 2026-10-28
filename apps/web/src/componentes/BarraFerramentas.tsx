import { NavLink } from 'react-router-dom';
import { rotuloEquipe } from '@benheimdall/shared';
import { useUi } from '../hooks/useUi';

export function BarraFerramentas({
  admin,
  equipes,
}: {
  admin: boolean;
  /** Equipes presentes no painel, com o nome e o supervisor de cada uma. */
  equipes: { equipe: number; nome: string; supervisor: string }[];
}) {
  const { equipe, setEquipe, busca, setBusca } = useUi();

  return (
    <div className="toolbar">
      <nav className="tabs" aria-label="Vistas">
        {/* O NavLink marca a aba ativa com aria-current="page", que o CSS destaca. */}
        <NavLink to="/painel">Painel</NavLink>
        <NavLink to="/salao">Mapa do salão</NavLink>
        {admin && <NavLink to="/usuarios">Usuários e acessos</NavLink>}
      </nav>
      <div className="chips" role="group" aria-label="Filtrar por equipe">
        <button type="button" className="chip" aria-pressed={equipe === -1} onClick={() => setEquipe(-1)}>
          Todas
        </button>
        {equipes.map(({ equipe: n, nome, supervisor }) => (
          <button
            key={n}
            type="button"
            className="chip"
            aria-pressed={equipe === n}
            onClick={() => setEquipe(n)}
            title={supervisor ? `${rotuloEquipe(n, nome)} · supervisor ${supervisor}` : rotuloEquipe(n, nome)}
          >
            {rotuloEquipe(n, nome)}
          </button>
        ))}
      </div>
      <label className="search">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar agente, ramal ou código do cliente"
          aria-label="Buscar agente, ramal ou código do cliente"
        />
      </label>
    </div>
  );
}
