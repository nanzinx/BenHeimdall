// Projeção por perfil: o que cada perfil pode ver, aplicado no backend antes de enviar.
//   admin      → tudo;
//   supervisor → status de todas as equipes; dados do cliente só da própria equipe
//                (das outras, só a campanha);
//   tv         → sem atendimento e sem motivo de pausa.
import type { Agente, Painel, Perfil } from '@benheimdall/shared';

export interface Leitor {
  perfil: Perfil;
  equipe: number | null;
}

export function projetarAgente(a: Agente, leitor: Leitor): Agente {
  if (leitor.perfil === 'admin') return a;
  const { atendimento, pausa, ...resto } = a;
  const saida: Agente = { ...resto };
  if (leitor.perfil === 'tv') {
    if (pausa) saida.pausa = { limiteSeg: pausa.limiteSeg, totalDiaSeg: pausa.totalDiaSeg };
    return saida;
  }
  if (pausa) saida.pausa = pausa;
  if (atendimento)
    saida.atendimento =
      leitor.equipe !== null && a.equipe === leitor.equipe
        ? atendimento
        : { campanha: atendimento.campanha, inicio: atendimento.inicio };
  return saida;
}

export function projetarPainel(p: Painel, leitor: Leitor): Painel {
  if (leitor.perfil === 'admin') return p;
  return { ...p, agentes: p.agentes.map((a) => projetarAgente(a, leitor)) };
}
