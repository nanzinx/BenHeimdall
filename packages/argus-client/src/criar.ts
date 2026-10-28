import type { ArgusClient } from './tipos';
import { MockArgusClient } from './mock/MockArgusClient';
import { RealArgusClient } from './real/RealArgusClient';

export interface CriarArgusOpcoes {
  modo: 'mock' | 'real';
  baseUrl?: string;
  token?: string;
  mockFalha?: boolean;
}

/** Escolhe o cliente pela variável ARGUS_MODE. */
export function criarArgusClient(opcoes: CriarArgusOpcoes): ArgusClient {
  if (opcoes.modo === 'real') {
    if (!opcoes.baseUrl) throw new Error('ARGUS_BASE_URL é obrigatória com ARGUS_MODE=real.');
    return new RealArgusClient({ baseUrl: opcoes.baseUrl, token: opcoes.token ?? '' });
  }
  return new MockArgusClient({ falha: opcoes.mockFalha });
}
