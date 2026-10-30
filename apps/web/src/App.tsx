import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { Perfil } from '@benheimdall/shared';
import { Marca } from './componentes/Topo';
import { useSessao } from './hooks/useSessao';
import { Layout } from './paginas/Layout';
import { Login } from './paginas/Login';
import { PaginaPainel } from './paginas/PaginaPainel';
import { PaginaSalao } from './paginas/PaginaSalao';
import { PaginaUsuarios } from './paginas/PaginaUsuarios';
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

/** O backend não respondeu: explica em vez de cair na tela de login (que não funcionaria). */
function ServidorFora({ mensagem, tentar }: { mensagem: string; tentar: () => void }) {
  return (
    <section className="gate" aria-label="Servidor fora do ar">
      <div className="login">
        <div className="login-brand">
          <span className="brand-mark" aria-hidden="true">
            <Marca />
          </span>
          <b>
            Ben<i>Heimdall</i>
          </b>
          <span>Painel de Atendimento</span>
        </div>
        <p className="login-lead">
          <b>O servidor não está respondendo.</b> Assim que ele subir, o painel abre sozinho.
        </p>
        <p className="fmsg" role="alert">
          {mensagem}
        </p>
        <button className="btn-primary" type="button" onClick={tentar}>
          Tentar de novo
        </button>
      </div>
    </section>
  );
}

export function App() {
  const { carregando, falha, sessao, revalidar } = useSessao();
  if (carregando) return <div className="splash">Carregando…</div>;
  if (falha && !sessao) return <ServidorFora mensagem={falha} tentar={revalidar} />;
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
        <Route path="/salao" element={<PaginaSalao />} />
        <Route
          path="/usuarios"
          element={
            <Protegido perfis={['admin']}>
              <PaginaUsuarios />
            </Protegido>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/painel" replace />} />
    </Routes>
  );
}
