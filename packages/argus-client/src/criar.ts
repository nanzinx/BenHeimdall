import type { ArgusClient } from './tipos';
import { MockArgusClient } from './mock/MockArgusClient';
import { RealArgusClient, type RealArgusOpcoes } from './real/RealArgusClient';

export type CriarArgusOpcoes = { modo: 'mock' | 'real'; mockFalha?: boolean } & Partial<RealArgusOpcoes>;

/** Escolhe o cliente pela variável ARGUS_MODE. */
export function criarArgusClient({ modo, mockFalha, ...real }: CriarArgusOpcoes): ArgusClient {
  if (modo === 'real') {
    if (!real.baseUrl) throw new Error('ARGUS_BASE_URL é obrigatória com ARGUS_MODE=real.');
    if (!real.token) throw new Error('ARGUS_TOKEN é obrigatório com ARGUS_MODE=real.');
    return new RealArgusClient({ ...real, baseUrl: real.baseUrl, token: real.token });
  }
  return new MockArgusClient({ falha: mockFalha });
}
