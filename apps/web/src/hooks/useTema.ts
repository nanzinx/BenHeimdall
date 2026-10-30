// Tema claro/escuro. Sem escolha salva, segue o sistema (e acompanha se ele mudar).
// O index.html aplica o tema antes da primeira pintura; este hook mantém e troca.
import { useCallback, useEffect, useState } from 'react';

export type Tema = 'claro' | 'escuro';
const CHAVE = 'benheimdall-tema';
const sistema = () => matchMedia('(prefers-color-scheme: dark)');

function salvo(): Tema | null {
  try {
    const t = localStorage.getItem(CHAVE);
    return t === 'claro' || t === 'escuro' ? t : null;
  } catch {
    return null;
  }
}

const aplicar = (t: Tema) => {
  document.documentElement.dataset.theme = t === 'escuro' ? 'dark' : 'light';
};

export function useTema() {
  const [tema, setTema] = useState<Tema>(() => salvo() ?? (sistema().matches ? 'escuro' : 'claro'));

  useEffect(() => aplicar(tema), [tema]);

  // Sem escolha salva, acompanha o tema do sistema.
  useEffect(() => {
    const m = sistema();
    const aoMudar = () => {
      if (!salvo()) setTema(m.matches ? 'escuro' : 'claro');
    };
    m.addEventListener('change', aoMudar);
    return () => m.removeEventListener('change', aoMudar);
  }, []);

  const alternar = useCallback(() => {
    setTema((atual) => {
      const novo: Tema = atual === 'escuro' ? 'claro' : 'escuro';
      try {
        localStorage.setItem(CHAVE, novo);
      } catch {
        // Sem armazenamento (janela anônima): vale até fechar a página.
      }
      return novo;
    });
  }, []);

  return { tema, alternar };
}
