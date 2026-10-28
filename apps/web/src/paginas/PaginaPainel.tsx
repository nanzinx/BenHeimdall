import { Colunas } from '../componentes/Colunas';
import { useDadosVista } from './Layout';

export function PaginaPainel() {
  const { painel, agentes } = useDadosVista();
  return <Colunas painel={painel} agentes={agentes} />;
}
