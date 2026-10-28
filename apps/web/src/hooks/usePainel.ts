// Fotografia inicial via TanStack Query (/api/painel) e atualizações via Socket.IO.
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import type { Painel } from '@benheimdall/shared';
import { api } from '../api/cliente';
import { useSessao } from './useSessao';

export const CHAVE_PAINEL = ['painel'];

export interface EstadoPainel {
  painel: Painel | undefined;
  /** Diferença (ms) entre o relógio do servidor e o do navegador: agora real = Date.now() + offset. */
  offsetMs: number;
  socketConectado: boolean;
  /** Ids de agentes que mudaram de status na última atualização (para o destaque visual). */
  mudaram: Set<string>;
}

export function usePainel(): EstadoPainel {
  const qc = useQueryClient();
  const { perdida } = useSessao();
  const [offsetMs, setOffset] = useState(0);
  const [socketConectado, setConectado] = useState(false);
  const [mudaram, setMudaram] = useState<Set<string>>(new Set());
  const anteriores = useRef(new Map<string, string>());

  const consulta = useQuery({
    queryKey: CHAVE_PAINEL,
    queryFn: () => api<Painel>('/api/painel'),
    // Atualizações chegam pelo socket; o refetch fica só como rede de segurança.
    staleTime: Infinity,
    refetchInterval: socketConectado ? false : 10_000,
  });

  const painel = consulta.data;

  useEffect(() => {
    if (!painel) return;
    setOffset(Date.parse(painel.atualizadoEm) - Date.now());
    const novos = new Set<string>();
    const mapa = anteriores.current;
    for (const a of painel.agentes) {
      const chave = `${a.status}|${a.desde}`;
      const antes = mapa.get(a.id);
      if (antes !== undefined && antes !== chave) novos.add(a.id);
      mapa.set(a.id, chave);
    }
    setMudaram(novos);
  }, [painel]);

  useEffect(() => {
    const socket = io({ withCredentials: true, transports: ['websocket', 'polling'] });
    socket.on('connect', () => setConectado(true));
    socket.on('disconnect', () => setConectado(false));
    socket.on('painel:atualizado', (p: Painel) => qc.setQueryData(CHAVE_PAINEL, p));
    socket.on('sessao:encerrada', (e: { codigo: string }) => perdida(e.codigo));
    socket.on('connect_error', (err: Error & { data?: { codigo?: string } }) => {
      const codigo = err.data?.codigo ?? err.message;
      if (['SEM_SESSAO', 'SESSAO_EXPIRADA', 'TROCA_SENHA'].includes(codigo)) {
        socket.close();
        perdida(codigo);
      }
    });
    return () => {
      socket.close();
    };
  }, [qc, perdida]);

  return { painel, offsetMs, socketConectado, mudaram };
}
