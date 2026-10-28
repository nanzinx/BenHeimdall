import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { Perfil } from '@benheimdall/shared';
import { useSessao } from './hooks/useSessao';
import { Layout } from './paginas/Layout';
import { Login } from './paginas/Login';
import { PaginaPainel } from './paginas/PaginaPainel';
import { TrocarSenha } from './paginas/TrocarSenha';

/** Sem sessão, tudo vai para /login; com troca de senha pendente, para /trocar-senha. */
function Protegido({ children, perfis }: { children: ReactNode; perfis?: Perfil[] }) {
  const { sessao, carregando } = useSessao();
  if (carregando) return <div className="splash">Carregando…</div>;
  if (!sessao) return <Navigate to="/login" replace />;
  if (sessao.usuario.trocaSenha) return <Navigate to="/trocar-senha" replace />;
  if (perfis && !perfis.includes(sessao.usuario.perfil)) return <Navigate to="/painel" replace />;
  return <>{children}</>;
}

export function App() {
  const { carregando } = useSessao();
  if (carregando) return <div className="splash">Carregando…</div>;
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/trocar-senha" element={<TrocarSenha />} />
      <Route
        element={
          <Protegido>
            <Layout />
          </Protegido>
        }
      >
        <Route path="/painel" element={<PaginaPainel />} />
      </Route>
      <Route path="*" element={<Navigate to="/painel" replace />} />
    </Routes>
  );
}
