// Única ação do painel na Argus: abrir o pop-up de transferência na tela de um operador em
// atendimento (doc 4.15). A API não transfere direto para um ramal; o operador escolhe o destino.
import { Router } from 'express';
import { ArgusRecusouError, type ArgusClient } from '@benheimdall/argus-client';
import { exigirSessao, sessaoDe } from '../acesso/http';
import type { ServicoAcesso } from '../acesso/servico';
import type { CicloLeitura } from '../leitura/ciclo';
import type { Log } from '../log';

/** Um pedido por agente a cada 10 s: evita abrir o pop-up várias vezes com cliques repetidos. */
const INTERVALO_MS = 10_000;

export function rotasTransferencia(
  servico: ServicoAcesso,
  producao: boolean,
  ciclo: CicloLeitura,
  argus: ArgusClient,
  log: Log,
  agora: () => number = Date.now,
) {
  const r = Router();
  const ultimoPedido = new Map<string, number>();

  r.post(
    '/agentes/:id/transferencia',
    exigirSessao(servico, producao, { renovar: true, perfis: ['admin', 'supervisor'] }),
    async (req, res) => {
      const { usuario } = sessaoDe(res);
      const id = String(req.params.id);
      const agente = ciclo.painelAtual().agentes.find((a) => a.id === id);
      if (!agente) {
        res.status(404).json({ codigo: 'NAO_ENCONTRADO', mensagem: 'Agente não encontrado.' });
        return;
      }
      if (usuario.perfil === 'supervisor' && usuario.equipe !== agente.equipe) {
        res.status(403).json({
          codigo: 'OUTRA_EQUIPE',
          mensagem: 'Você só pode transferir ligações da sua equipe.',
        });
        return;
      }
      if (agente.status !== 'ATENDENDO') {
        res.status(409).json({
          codigo: 'SEM_LIGACAO',
          mensagem: `${agente.nome} não está em ligação agora.`,
        });
        return;
      }
      const t = agora();
      if (t - (ultimoPedido.get(id) ?? 0) < INTERVALO_MS) {
        res.status(429).json({
          codigo: 'AGUARDE',
          mensagem: 'A transferência deste agente acabou de ser aberta. Aguarde alguns segundos.',
        });
        return;
      }
      ultimoPedido.set(id, t);

      const registrar = (evento: string, extra = '') =>
        servico.repo.registrarAcesso({
          em: new Date(t).toISOString(),
          usuario: usuario.usuario,
          evento,
          detalhe: `${agente.nome} (ramal ${agente.ramal})${extra}`,
          ip: req.ip ?? null,
        });
      try {
        await argus.abrirTransferencia(agente.ramal);
      } catch (err) {
        ultimoPedido.delete(id);
        const recusou = err instanceof ArgusRecusouError;
        registrar('TRANSFERENCIA_FALHOU', `: ${(err as Error).message}`);
        log.warn({ ramal: agente.ramal, err: (err as Error).message }, 'Pop-up de transferência não abriu');
        res.status(recusou ? 409 : 502).json({
          codigo: recusou ? 'ARGUS_RECUSOU' : 'ARGUS_INDISPONIVEL',
          mensagem: recusou
            ? `A Argus não abriu a transferência: ${(err as Error).message}`
            : 'A Argus não respondeu. Tente de novo em instantes.',
        });
        return;
      }
      registrar('TRANSFERENCIA');
      log.info({ ramal: agente.ramal, por: usuario.usuario }, 'Pop-up de transferência aberto');
      res.json({ ok: true, mensagem: `Tela de transferência aberta no computador de ${agente.nome}.` });
    },
  );

  return r;
}
