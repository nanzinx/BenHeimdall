// Utilitários de teste: leitura completa do mock, já validada.
import { MockArgusClient } from '@benheimdall/argus-client';
import { validarLeitura, type LimitesPausa } from '../src/leitura/normalizador';

export const LIMITES: LimitesPausa = {
  padraoSeg: 900,
  porMotivoSeg: { Lanche: 900, Banheiro: 300, Feedback: 1200, Treinamento: 2700, Particular: 600 },
};

export async function lerMock(mock: MockArgusClient) {
  const [agentes, chamadas, motivos, fila, callbacks] = await Promise.all([
    mock.listarAgentes(),
    mock.listarChamadasAtivas(),
    mock.listarMotivosPausa(),
    mock.obterFila(),
    mock.obterCallbacks(),
  ]);
  return validarLeitura({ agentes, chamadas, motivos, fila, callbacks });
}
