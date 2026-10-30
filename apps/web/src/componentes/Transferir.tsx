// Botão "Transferir ligação" no detalhe do agente. A API da Argus só abre o pop-up de
// transferência na tela do operador: quem escolhe o destino é ele. Por isso o painel mostra os
// livres agora, para o supervisor indicar para quem passar.
import clsx from 'clsx';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { listarLivres, type Agente } from '@benheimdall/shared';
import { api, ErroApi } from '../api/cliente';
import { useUi } from '../hooks/useUi';

/** Use com `key={agente.id}`: outro agente aberto começa do zero. */
export function Transferir({ agente, agentes }: { agente: Agente; agentes: Agente[] }) {
  const { ordem } = useUi();
  const [confirmando, setConfirmando] = useState(false);
  const pedir = useMutation({
    mutationFn: () =>
      api<{ mensagem: string }>(`/api/agentes/${encodeURIComponent(agente.id)}/transferencia`, {
        method: 'POST',
      }),
    onSettled: () => setConfirmando(false),
  });

  const livres = listarLivres(agentes, ordem).slice(0, 3);
  const erro =
    pedir.error instanceof ErroApi
      ? pedir.error.message
      : pedir.error
        ? 'Não foi possível falar com o servidor.'
        : '';

  return (
    <div className="transf">
      {confirmando ? (
        <>
          <p>
            Abre a tela de transferência da Argus no computador de <b>{agente.nome}</b>. Ele escolhe o destino
            lá.
          </p>
          <p className="fhint">
            {livres.length
              ? `Livres agora: ${livres.map((l) => `${l.nome} (ramal ${l.ramal})`).join(' · ')}`
              : 'Ninguém livre agora.'}
          </p>
          <div className="transf-acoes">
            <button
              className="btn-primary"
              type="button"
              disabled={pedir.isPending}
              onClick={() => pedir.mutate()}
            >
              {pedir.isPending ? 'Abrindo…' : 'Abrir transferência'}
            </button>
            <button className="btn-ghost" type="button" onClick={() => setConfirmando(false)}>
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <button
          className="btn-primary"
          type="button"
          onClick={() => {
            pedir.reset();
            setConfirmando(true);
          }}
        >
          Transferir ligação
        </button>
      )}
      <p className={clsx('fmsg', pedir.isSuccess && '!text-livre')} role="status">
        {pedir.isSuccess ? pedir.data.mensagem : erro}
      </p>
    </div>
  );
}
