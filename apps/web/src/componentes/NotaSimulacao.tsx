// Faixa que avisa quando a Argus é simulada (ARGUS_MODE=mock), com o botão de simular queda.
import { useMutation, useQuery } from '@tanstack/react-query';
import type { Saude } from '@benheimdall/shared';
import { api } from '../api/cliente';

export function NotaSimulacao() {
  const saude = useQuery({ queryKey: ['saude'], queryFn: () => api<Saude>('/api/saude'), staleTime: 60_000 });
  const queda = useMutation({
    mutationFn: () => api('/api/dev/argus/queda', { method: 'POST', body: { segundos: 15 } }),
  });

  if (saude.data?.argus.modo !== 'mock') return null;
  return (
    <div className="sim-note">
      <span className="tag">Simulação</span>
      <span>Argus simulada (ARGUS_MODE=mock). Nomes e telefones são fictícios.</span>
      {saude.data.simulacao && (
        <button className="btn-ghost" type="button" disabled={queda.isPending} onClick={() => queda.mutate()}>
          Simular queda da Argus (15 s)
        </button>
      )}
    </div>
  );
}
