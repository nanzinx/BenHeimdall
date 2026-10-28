// Administração de contas (só admin): lista, nova conta, desativar/reativar, nova senha e log.
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  EQUIPES,
  equipesDoPainel,
  type Painel,
  ROTULO_PERFIL,
  nomeDoEmail,
  novoUsuarioSchema,
  type Perfil,
  type RegistroAcesso,
  type UsuarioPublico,
} from '@benheimdall/shared';
import { api, ErroApi } from '../api/cliente';
import { CHAVE_PAINEL } from '../hooks/usePainel';
import { useSessao } from '../hooks/useSessao';

const dataHora = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

interface ComSenha {
  usuario: UsuarioPublico;
  senhaTemporaria: string;
}

export function PaginaUsuarios() {
  const qc = useQueryClient();
  const { sessao } = useSessao();
  const eu = sessao!.usuario;
  const [aviso, setAviso] = useState<{ texto: string; senha?: string; erro?: boolean } | null>(null);

  const usuarios = useQuery({
    queryKey: ['usuarios'],
    queryFn: () => api<UsuarioPublico[]>('/api/usuarios'),
  });
  const acessos = useQuery({
    queryKey: ['acessos'],
    queryFn: () => api<RegistroAcesso[]>('/api/acessos?limite=200'),
    refetchInterval: 15_000,
  });

  const atualizar = () => {
    void qc.invalidateQueries({ queryKey: ['usuarios'] });
    void qc.invalidateQueries({ queryKey: ['acessos'] });
  };
  const falhou = (e: unknown) =>
    setAviso({
      texto: e instanceof ErroApi ? e.message : 'Não foi possível concluir. Tente de novo.',
      erro: true,
    });

  const alternar = useMutation({
    mutationFn: (u: UsuarioPublico) =>
      api<UsuarioPublico>(`/api/usuarios/${u.id}/${u.ativo ? 'desativar' : 'reativar'}`, { method: 'POST' }),
    onSuccess: (u) => {
      setAviso({ texto: `Conta ${u.usuario} ${u.ativo ? 'reativada' : 'desativada'}.` });
      atualizar();
    },
    onError: falhou,
  });

  const novaSenha = useMutation({
    mutationFn: (u: UsuarioPublico) => api<ComSenha>(`/api/usuarios/${u.id}/nova-senha`, { method: 'POST' }),
    onSuccess: (r) => {
      setAviso({ texto: `Nova senha temporária de ${r.usuario.usuario}:`, senha: r.senhaTemporaria });
      atualizar();
    },
    onError: falhou,
  });

  const lista = usuarios.data ?? [];

  return (
    <div className="adm-grid">
      <div className="col">
        <div className="col-h">
          <h2>Contas de acesso</h2>
          <span
            className="count"
            style={{ '--c': 'var(--brand-txt)', '--tint': 'var(--surface-2)' } as React.CSSProperties}
          >
            {lista.length}
          </span>
          <span className="hint">supervisores, administradores e telas</span>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Perfil</th>
                <th>Último acesso</th>
                <th>Situação</th>
                <th>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lista.map((u) => (
                <tr key={u.id}>
                  <td>{u.nome}</td>
                  <td className="email" title={u.usuario}>
                    {u.usuario}
                  </td>
                  <td>
                    {ROTULO_PERFIL[u.perfil]}
                    {u.perfil === 'supervisor' && u.equipe ? ` · Eq. ${u.equipe}` : ''}
                  </td>
                  <td className="mono">{dataHora(u.ultimoAcesso)}</td>
                  <td>
                    <span className={`badge ${u.ativo ? 'on' : 'off'}`}>
                      {u.ativo ? 'Ativa' : 'Desativada'}
                    </span>
                    {u.ativo && u.trocaSenha && (
                      <small className="restr pendente">troca de senha pendente</small>
                    )}
                  </td>
                  <td>
                    <div className="acts">
                      {u.id === eu.id ? (
                        <small>sua conta</small>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="btn-ghost sm"
                            disabled={alternar.isPending}
                            onClick={() => alternar.mutate(u)}
                          >
                            {u.ativo ? 'Desativar' : 'Reativar'}
                          </button>
                          <button
                            type="button"
                            className="btn-ghost sm"
                            disabled={novaSenha.isPending || !u.ativo}
                            onClick={() => {
                              if (
                                confirm(
                                  `Gerar uma nova senha temporária para ${u.usuario}? As sessões abertas dessa conta serão encerradas.`,
                                )
                              )
                                novaSenha.mutate(u);
                            }}
                          >
                            Nova senha
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {usuarios.isError && <p className="aviso">Não foi possível carregar as contas.</p>}
        {aviso && (
          <p className="aviso" role="status" style={aviso.erro ? { color: 'var(--st-crit)' } : undefined}>
            {aviso.texto}
            {aviso.senha && (
              <>
                {' '}
                <b className="mono">{aviso.senha}</b>
                <br />
                <small>
                  Anote e entregue à pessoa: ela não aparece de novo. A troca é obrigatória no primeiro
                  acesso.
                </small>
              </>
            )}
          </p>
        )}
      </div>

      <div className="col">
        <div className="col-h">
          <h2>Nova conta</h2>
        </div>
        <NovaConta
          aoCriar={(r) => {
            setAviso({
              texto: `Conta ${r.usuario.usuario} criada. Senha temporária:`,
              senha: r.senhaTemporaria,
            });
            atualizar();
          }}
        />
        <div className="col-h" style={{ borderTop: '1px solid var(--line)' }}>
          <h2>Log de acessos</h2>
        </div>
        <ul className="log">
          {acessos.data?.length ? (
            acessos.data.map((l) => (
              <li key={l.id} title={l.ip ? `IP ${l.ip}` : undefined}>
                <time className="mono">{dataHora(l.em)}</time>
                <b className="mono">{l.usuario}</b>
                <span>
                  {l.evento}
                  {l.detalhe ? ` · ${l.detalhe}` : ''}
                </span>
              </li>
            ))
          ) : (
            <li className="empty">{acessos.isPending ? 'Carregando…' : 'Nenhum acesso registrado ainda.'}</li>
          )}
        </ul>
      </div>
    </div>
  );
}

function NovaConta({ aoCriar }: { aoCriar: (r: ComSenha) => void }) {
  const [nome, setNome] = useState('');
  const [usuario, setUsuario] = useState('');
  const [perfil, setPerfil] = useState<Perfil>('supervisor');
  const [equipe, setEquipe] = useState(1);
  const [erro, setErro] = useState('');

  // Equipes como estão no painel agora (na Argus real, uma por supervisor). Sem painel, 1 a 5.
  const qc = useQueryClient();
  const painel = qc.getQueryData<Painel>(CHAVE_PAINEL);
  const doPainel = painel ? equipesDoPainel(painel.agentes).filter((e) => e.equipe > 0) : [];
  const opcoesEquipe = doPainel.length ? doPainel : EQUIPES.map((n) => ({ equipe: n, supervisor: '' }));

  const criar = useMutation({
    mutationFn: (dados: unknown) => api<ComSenha>('/api/usuarios', { method: 'POST', body: dados }),
    onSuccess: (r) => {
      setNome('');
      setUsuario('');
      aoCriar(r);
    },
    onError: (e) => setErro(e instanceof ErroApi ? e.message : 'Não foi possível criar a conta.'),
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    const dados = novoUsuarioSchema.safeParse({
      nome,
      usuario,
      perfil,
      equipe: perfil === 'supervisor' ? equipe : null,
    });
    if (!dados.success) {
      setErro(dados.error.issues[0]?.message ?? 'Confira os campos.');
      return;
    }
    criar.mutate(dados.data);
  }

  return (
    <form className="fnovo" onSubmit={enviar} noValidate>
      <label>
        E-mail (é o login)
        <input
          type="email"
          inputMode="email"
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          // Sem nome digitado, sugere a partir do e-mail: juliana.mendes@… → Juliana Mendes.
          onBlur={() => {
            const email = usuario.trim().toLowerCase();
            if (!nome.trim() && email.includes('@')) setNome(nomeDoEmail(email));
          }}
          maxLength={254}
          placeholder="Ex.: juliana.mendes@benconsig.com"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
      </label>
      <label>
        Nome
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          maxLength={60}
          placeholder="Ex.: Juliana Mendes"
        />
      </label>
      <label>
        Perfil
        <select value={perfil} onChange={(e) => setPerfil(e.target.value as Perfil)}>
          <option value="supervisor">Supervisor</option>
          <option value="admin">Administrador</option>
          <option value="tv">Tela TV</option>
        </select>
      </label>
      {perfil === 'supervisor' && (
        <label>
          Equipe
          <select value={equipe} onChange={(e) => setEquipe(Number(e.target.value))}>
            {opcoesEquipe.map(({ equipe: n, supervisor }) => (
              <option key={n} value={n}>
                Equipe {n}
                {supervisor ? ` · ${supervisor}` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="fmsg" role="alert">
        {erro}
      </p>
      <button type="submit" className="btn-primary" disabled={criar.isPending}>
        {criar.isPending ? 'Criando…' : 'Criar conta'}
      </button>
      <p className="fhint">
        A conta nasce com uma senha temporária, e a troca é obrigatória no primeiro acesso.
      </p>
    </form>
  );
}
