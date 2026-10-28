import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { SENHA_MIN, trocarSenhaSchema } from '@benheimdall/shared';
import { ErroApi } from '../api/cliente';
import { useSessao } from '../hooks/useSessao';

export function TrocarSenha() {
  const { sessao, trocarSenha, sair } = useSessao();
  const navegar = useNavigate();
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (!sessao) return <Navigate to="/login" replace />;
  const obrigatoria = sessao.usuario.trocaSenha;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    const dados = trocarSenhaSchema.safeParse({ senhaAtual: atual, novaSenha: nova });
    if (!dados.success) {
      setErro(dados.error.issues[0]?.message ?? 'Confira os campos.');
      return;
    }
    if (nova !== confirma) {
      setErro('A confirmação não bate com a nova senha.');
      return;
    }
    setEnviando(true);
    try {
      await trocarSenha(dados.data);
      navegar('/painel', { replace: true });
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : 'Não foi possível trocar a senha. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="gate" aria-label="Trocar senha">
      <form className="login" onSubmit={enviar} noValidate>
        <div className="login-brand">
          <b>
            Ben<i>Heimdall</i>
          </b>
          <span>Troca de senha</span>
        </div>
        <p className="login-lead">
          {obrigatoria
            ? `Olá, ${sessao.usuario.nome}. Você entrou com uma senha temporária: crie a sua senha para continuar.`
            : 'Defina uma nova senha de acesso.'}
        </p>
        <label>
          {obrigatoria ? 'Senha temporária' : 'Senha atual'}
          <input
            type="password"
            value={atual}
            onChange={(e) => setAtual(e.target.value)}
            autoComplete="current-password"
            autoFocus
          />
        </label>
        <label>
          Nova senha
          <input
            type="password"
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <label>
          Confirme a nova senha
          <input
            type="password"
            value={confirma}
            onChange={(e) => setConfirma(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <p className="fmsg" role="alert">
          {erro}
        </p>
        <button className="btn-primary" type="submit" disabled={enviando}>
          {enviando ? 'Salvando…' : 'Salvar nova senha'}
        </button>
        <p className="fhint">Mínimo de {SENHA_MIN} caracteres, diferente da senha atual.</p>
        <button
          type="button"
          className="btn-ghost sm"
          onClick={() => {
            void sair().then(() => navegar('/login', { replace: true }));
          }}
        >
          {obrigatoria ? 'Sair sem trocar' : 'Cancelar'}
        </button>
      </form>
    </section>
  );
}
