// Renova a sessão quando o usuário mexe na tela (clique, tecla, mouse, rolagem).
// No máximo uma renovação a cada 30 s: a sessão expira após 15 min sem uso.
import { useEffect, useRef } from 'react';

const INTERVALO_MS = 30_000;
const EVENTOS = ['click', 'keydown', 'pointermove', 'scroll', 'touchstart'] as const;

export function useAtividade(ativo: boolean, renovar: () => Promise<void>) {
  const ultima = useRef(Date.now());
  const renovarRef = useRef(renovar);
  renovarRef.current = renovar;

  useEffect(() => {
    if (!ativo) return;
    const aoMexer = () => {
      if (Date.now() - ultima.current < INTERVALO_MS) return;
      ultima.current = Date.now();
      void renovarRef.current().catch(() => undefined);
    };
    for (const e of EVENTOS) document.addEventListener(e, aoMexer, { passive: true });
    return () => {
      for (const e of EVENTOS) document.removeEventListener(e, aoMexer);
    };
  }, [ativo]);
}
