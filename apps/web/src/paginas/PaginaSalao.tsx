import { MapaSalao } from '../componentes/MapaSalao';
import { useDadosVista } from './Layout';

export function PaginaSalao() {
  const { painel, agentes } = useDadosVista();
  // O mapa sempre mostra o salão inteiro; quem está fora do filtro fica esmaecido.
  return <MapaSalao todos={painel.agentes} visiveis={agentes} />;
}
