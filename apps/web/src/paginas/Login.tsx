import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { loginSchema } from '@benheimdall/shared';
import { ErroApi } from '../api/cliente';
import { Marca } from '../componentes/Topo';
import { useSessao } from '../hooks/useSessao';

export function Login() {
  const { sessao, entrar, aviso } = useSessao();
  const navegar = useNavigate();
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (sessao) return <Navigate to={sessao.usuario.trocaSenha ? '/trocar-senha' : '/painel'} replace />;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    const dados = loginSchema.safeParse({ usuario, senha });
    if (!dados.success) {
      setErro('Informe usuário e senha.');
      return;
    }
    setEnviando(true);
    try {
      const s = await entrar(dados.data);
      setSenha('');
      navegar(s.usuario.trocaSenha ? '/trocar-senha' : '/painel', { replace: true });
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : 'Não foi possível falar com o servidor. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="gate" aria-label="Entrar no painel">
      <form className="login" onSubmit={enviar} noValidate>
        <div className="login-brand">
          <span
            className="brand-mark"
            style={{ background: 'var(--brand)', marginBottom: 8 }}
            aria-hidden="true"
          >
            <Marca />
          </span>
          <b>
            Ben<i>Heimdall</i>
          </b>
          <span>Painel de Atendimento</span>
        </div>
        <p className="login-lead">Acesso restrito a supervisores e administradores.</p>
        <label>
          Usuário
          <input
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoFocus
            required
          />
        </label>
        <label>
          Senha
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <p className="fmsg" role="alert">
          {erro || aviso}
        </p>
        <button className="btn-primary" type="submit" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
        <p className="fhint">
          A sessão expira após 15 min sem uso. Depois de 5 senhas erradas, o usuário fica bloqueado por 5 min.
        </p>
      </form>
    </section>
  );
}
