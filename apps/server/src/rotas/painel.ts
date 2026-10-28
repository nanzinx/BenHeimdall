import { Router } from 'express';
import type { DetalheAgente } from '@benheimdall/shared';
import { exigirSessao, sessaoDe } from '../acesso/http';
import type { ServicoAcesso } from '../acesso/servico';
import type { CicloLeitura } from '../leitura/ciclo';
import type { RegistroStatus } from '../leitura/eventos';
import { projetarPainel } from '../projecao';

export function rotasPainel(
  servico: ServicoAcesso,
  producao: boolean,
  ciclo: CicloLeitura,
  registro: RegistroStatus,
) {
  const r = Router();

  // Fotografia atual, já filtrada pelo perfil. Leitura automática: não renova a sessão.
  r.get('/painel', exigirSessao(servico, producao, { renovar: false }), (_req, res) => {
    const { usuario } = sessaoDe(res);
    res.json(projetarPainel(ciclo.painelAtual(), usuario));
  });

  // Detalhe do agente (clique do usuário: renova). O perfil tv não abre detalhe.
  r.get(
    '/agentes/:id',
    exigirSessao(servico, producao, { renovar: true, perfis: ['admin', 'supervisor'] }),
    (req, res) => {
      const id = String(req.params.id);
      if (!ciclo.painelAtual().agentes.some((a) => a.id === id)) {
        res.status(404).json({ codigo: 'NAO_ENCONTRADO', mensagem: 'Agente não encontrado.' });
        return;
      }
      const agora = new Date();
      const corpo: DetalheAgente = {
        agenteId: id,
        linhaDoTempo: registro.linhaDoTempo(id, agora),
        pausaTotalSeg: registro.pausasDoDia(agora).get(id) ?? 0,
      };
      res.json(corpo);
    },
  );

  return r;
}
