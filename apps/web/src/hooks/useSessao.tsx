// Sessão do usuário: quem está logado, quando a sessão expira e as ações de entrar/sair.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoginEntrada, SessaoAtual, TrocarSenhaEntrada } from '@benheimdall/shared';
import { api, definirAoPerderSessao, ErroApi } from '../api/cliente';

interface ContextoSessao {
  sessao: SessaoAtual | null;
  carregando: boolean;
  /** O servidor não respondeu ao conferir a sessão (backend fora do ar, por exemplo). */
  falha: string;
  /** Mensagem para a tela de login (sessão expirada, encerrada...). */
  aviso: string;
  entrar(dados: LoginEntrada): Promise<SessaoAtual>;
  sair(): Promise<void>;
  trocarSenha(dados: TrocarSenhaEntrada): Promise<SessaoAtual>;
  renovar(): Promise<void>;
  /** A sessão acabou do lado do servidor (expirou, conta desativada...). */
  perdida(codigo: string): void;
  /** Confere de novo a sessão no servidor (ex.: o contador local chegou a zero). */
  revalidar(): void;
}

const Ctx = createContext<ContextoSessao | null>(null);
const CHAVE = ['sessao'];

const MENSAGENS: Record<string, string> = {
  SESSAO_EXPIRADA: 'Sua sessão expirou por inatividade. Entre de novo.',
  SEM_SESSAO: 'Sua sessão foi encerrada. Entre de novo.',
};

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [aviso, setAviso] = useState('');

  const consulta = useQuery({
    queryKey: CHAVE,
    queryFn: async () => {
      try {
        return await api<SessaoAtual>('/api/sessao');
      } catch (e) {
        if (e instanceof ErroApi && e.status === 401) {
          if (e.codigo === 'SESSAO_EXPIRADA') setAviso(MENSAGENS.SESSAO_EXPIRADA!);
          return null;
        }
        throw e;
      }
    },
    staleTime: Infinity,
    retry: 1,
    // Backend fora do ar: tenta de novo sozinho e entra assim que ele subir.
    refetchInterval: (q) => (q.state.status === 'error' ? 3000 : false),
  });

  const definir = useCallback((s: SessaoAtual | null) => qc.setQueryData(CHAVE, s), [qc]);

  const perdida = useCallback(
    (codigo: string) => {
      if (codigo === 'TROCA_SENHA') {
        void qc.invalidateQueries({ queryKey: CHAVE });
        return;
      }
      setAviso(MENSAGENS[codigo] ?? MENSAGENS.SEM_SESSAO!);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'sessao' });
      definir(null);
    },
    [qc, definir],
  );

  useEffect(() => definirAoPerderSessao(perdida), [perdida]);

  const valor = useMemo<ContextoSessao>(
    () => ({
      sessao: consulta.data ?? null,
      carregando: consulta.isPending,
      falha: consulta.isError && !consulta.data ? consulta.error.message : '',
      aviso,
      perdida,
      revalidar: () => void qc.invalidateQueries({ queryKey: CHAVE }),
      async entrar(dados) {
        const s = await api<SessaoAtual>('/api/sessao/entrar', { method: 'POST', body: dados });
        setAviso('');
        definir(s);
        return s;
      },
      async sair() {
        await api('/api/sessao/sair', { method: 'POST' }).catch(() => undefined);
        setAviso('');
        qc.clear();
        definir(null);
      },
      async trocarSenha(dados) {
        const s = await api<SessaoAtual>('/api/sessao/trocar-senha', { method: 'POST', body: dados });
        definir(s);
        return s;
      },
      async renovar() {
        definir(await api<SessaoAtual>('/api/sessao/renovar', { method: 'POST' }));
      },
    }),
    [consulta.data, consulta.isPending, consulta.isError, consulta.error, aviso, perdida, definir, qc],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useSessao(): ContextoSessao {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSessao fora do ProvedorSessao');
  return c;
}
