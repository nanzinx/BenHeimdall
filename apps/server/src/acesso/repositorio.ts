// Acesso às tabelas usuarios, sessoes e acessos.
import type { Perfil, RegistroAcesso, UsuarioPublico } from '@benheimdall/shared';
import type { Banco } from '../db/banco';

export interface LinhaUsuario {
  id: number;
  usuario: string;
  nome: string;
  perfil: Perfil;
  equipe: number | null;
  senha_hash: string;
  ativo: 0 | 1;
  troca_senha: 0 | 1;
  tentativas: number;
  bloqueado_ate: string | null;
  criado_em: string;
  ultimo_acesso: string | null;
}

export interface LinhaSessao {
  id: string;
  usuario_id: number;
  criada_em: string;
  ultimo_uso: string;
  ip: string | null;
  encerrada_em: string | null;
  motivo_fim: string | null;
}

export function usuarioPublico(u: LinhaUsuario): UsuarioPublico {
  return {
    id: u.id,
    usuario: u.usuario,
    nome: u.nome,
    perfil: u.perfil,
    equipe: u.equipe,
    ativo: u.ativo === 1,
    trocaSenha: u.troca_senha === 1,
    ultimoAcesso: u.ultimo_acesso,
  };
}

export class Repositorio {
  constructor(readonly db: Banco) {}

  // ---------- usuários ----------

  contarUsuarios(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM usuarios').get() as { n: number }).n;
  }

  usuarioPorNome(usuario: string): LinhaUsuario | undefined {
    return this.db.prepare<[string], LinhaUsuario>('SELECT * FROM usuarios WHERE usuario = ?').get(usuario);
  }

  usuarioPorId(id: number): LinhaUsuario | undefined {
    return this.db.prepare<[number], LinhaUsuario>('SELECT * FROM usuarios WHERE id = ?').get(id);
  }

  listarUsuarios(): LinhaUsuario[] {
    return this.db
      .prepare<[], LinhaUsuario>('SELECT * FROM usuarios ORDER BY ativo DESC, perfil, nome')
      .all();
  }

  criarUsuario(u: {
    usuario: string;
    nome: string;
    perfil: Perfil;
    equipe: number | null;
    hash: string;
    em: string;
  }) {
    const r = this.db
      .prepare(
        `INSERT INTO usuarios (usuario, nome, perfil, equipe, senha_hash, ativo, troca_senha, criado_em)
         VALUES (?, ?, ?, ?, ?, 1, 1, ?)`,
      )
      .run(u.usuario, u.nome, u.perfil, u.equipe, u.hash, u.em);
    return Number(r.lastInsertRowid);
  }

  definirAtivo(id: number, ativo: boolean) {
    this.db.prepare('UPDATE usuarios SET ativo = ? WHERE id = ?').run(ativo ? 1 : 0, id);
  }

  definirSenha(id: number, hash: string, trocaObrigatoria: boolean) {
    this.db
      .prepare(
        'UPDATE usuarios SET senha_hash = ?, troca_senha = ?, tentativas = 0, bloqueado_ate = NULL WHERE id = ?',
      )
      .run(hash, trocaObrigatoria ? 1 : 0, id);
  }

  registrarFalha(id: number, tentativas: number, bloqueadoAte: string | null) {
    this.db
      .prepare('UPDATE usuarios SET tentativas = ?, bloqueado_ate = ? WHERE id = ?')
      .run(tentativas, bloqueadoAte, id);
  }

  registrarEntrada(id: number, em: string) {
    this.db
      .prepare('UPDATE usuarios SET tentativas = 0, bloqueado_ate = NULL, ultimo_acesso = ? WHERE id = ?')
      .run(em, id);
  }

  // ---------- sessões ----------

  criarSessao(id: string, usuarioId: number, em: string, ip: string | null) {
    this.db
      .prepare('INSERT INTO sessoes (id, usuario_id, criada_em, ultimo_uso, ip) VALUES (?, ?, ?, ?, ?)')
      .run(id, usuarioId, em, em, ip);
  }

  sessaoAberta(id: string): LinhaSessao | undefined {
    return this.db
      .prepare<[string], LinhaSessao>('SELECT * FROM sessoes WHERE id = ? AND encerrada_em IS NULL')
      .get(id);
  }

  tocarSessao(id: string, em: string) {
    this.db.prepare('UPDATE sessoes SET ultimo_uso = ? WHERE id = ?').run(em, id);
  }

  encerrarSessao(id: string, em: string, motivo: string) {
    this.db
      .prepare('UPDATE sessoes SET encerrada_em = ?, motivo_fim = ? WHERE id = ? AND encerrada_em IS NULL')
      .run(em, motivo, id);
  }

  /** Encerra todas as sessões abertas do usuário. Devolve quantas foram encerradas. */
  encerrarSessoesDoUsuario(usuarioId: number, em: string, motivo: string): number {
    return this.db
      .prepare(
        'UPDATE sessoes SET encerrada_em = ?, motivo_fim = ? WHERE usuario_id = ? AND encerrada_em IS NULL',
      )
      .run(em, motivo, usuarioId).changes;
  }

  /** Sessões abertas sem uso desde `limite`, de perfis que expiram. */
  sessoesOciosas(limite: string): (LinhaSessao & { usuario: string })[] {
    return this.db
      .prepare<[string], LinhaSessao & { usuario: string }>(
        `SELECT s.*, u.usuario FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
          WHERE s.encerrada_em IS NULL AND u.perfil <> 'tv' AND s.ultimo_uso < ?`,
      )
      .all(limite);
  }

  // ---------- log de acessos ----------

  registrarAcesso(a: {
    em: string;
    usuario: string;
    evento: string;
    detalhe?: string | null;
    ip?: string | null;
  }) {
    this.db
      .prepare('INSERT INTO acessos (em, usuario, evento, detalhe, ip) VALUES (?, ?, ?, ?, ?)')
      .run(a.em, a.usuario, a.evento, a.detalhe ?? null, a.ip ?? null);
  }

  listarAcessos(limite: number): RegistroAcesso[] {
    return this.db
      .prepare<[number], RegistroAcesso>('SELECT * FROM acessos ORDER BY id DESC LIMIT ?')
      .all(limite);
  }
}
