// Rotas de desenvolvimento: simular a queda da Argus no modo mock. Não existem em produção.
import { Router } from 'express';
import { z } from 'zod';
import type { MockArgusClient } from '@benheimdall/argus-client';
import { exigirSessao } from '../acesso/http';
import type { ServicoAcesso } from '../acesso/servico';
import type { CicloLeitura } from '../leitura/ciclo';

const quedaSchema = z.object({ segundos: z.number().int().min(1).max(600).optional() }).default({});

export function rotasDev(servico: ServicoAcesso, mock: MockArgusClient, ciclo: CicloLeitura) {
  const r = Router();
  r.use(exigirSessao(servico, false, { renovar: true, perfis: ['admin', 'supervisor'] }));

  r.post('/argus/queda', async (req, res) => {
    const { segundos } = quedaSchema.parse(req.body ?? {});
    mock.simularFalha(segundos ?? 15);
    await ciclo.executar();
    res.json({ emFalha: mock.emFalha, segundos: segundos ?? 15 });
  });

  r.post('/argus/restaurar', async (_req, res) => {
    mock.restaurar();
    await ciclo.executar();
    res.json({ emFalha: mock.emFalha });
  });

  return r;
}
