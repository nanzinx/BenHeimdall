// Relógio que bate a cada segundo, corrigido pela hora do servidor.
import { useEffect, useState } from 'react';

export function useRelogio(offsetMs: number): number {
  const [agora, setAgora] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    setAgora(Date.now() + offsetMs);
    const id = setInterval(() => setAgora(Date.now() + offsetMs), 1000);
    return () => clearInterval(id);
  }, [offsetMs]);
  return agora;
}
