// Regras de acesso: login, sessão, bloqueio, troca obrigatória de senha, IP da TV e
// administração de contas. Tudo que acontece aqui fica registrado na tabela `acessos`.
import { createHash, randomBytes } from 'node:crypto';
import {
  nomeDoEmail,
  type NovoUsuarioEntrada,
  type SessaoAtual,
  type UsuarioPublico,
} from '@benheimdall/shared';
import type { Log } from '../log';
import { Repositorio, usuarioPublico, type LinhaUsuario } from './repositorio';
import { normalizarIp, type ListaIps } from './ips';
import { CUSTO_BCRYPT, conferirSenha, gerarHash, gerarSenhaTemporaria } from './senhas';

export const MAX_TENTATIVAS = 5;
export const BLOQUEIO_MIN = 5;

export interface OpcoesAcesso {
  sessaoMin: number;
  tvIps: ListaIps;
  log: Log;
  agora?: () => Date;
  custoBcrypt?: number;
}

/** Erro de regra de negócio, já com o status HTTP e a mensagem para a tela. */
export class ErroAcesso extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    message: string,
  ) {
    super(message);
    this.name = 'ErroAcesso';
  }
}

export interface SessaoValida {
  sessaoId: string;
  usuario: UsuarioPublico;
  expiraEm: string | null;
}

export type ResultadoValidacao =
  { ok: true; sessao: SessaoValida } | { ok: false; codigo: 'SEM_SESSAO' | 'SESSAO_EXPIRADA' };

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export { normalizarIp };

export class ServicoAcesso {
  readonly repo: Repositorio;
  private readonly agora: () => Date;
  private readonly custo: number;
  private hashFalso: Promise<string> | undefined;

  constructor(
    repo: Repositorio,
    private readonly o: OpcoesAcesso,
  ) {
    this.repo = repo;
    this.agora = o.agora ?? (() => new Date());
    this.custo = o.custoBcrypt ?? CUSTO_BCRYPT;
  }

  get sessaoMin() {
    return this.o.sessaoMin;
  }

  private agoraIso() {
    return this.agora().toISOString();
  }

  private registrar(usuario: string, evento: string, detalhe?: string | null, ip?: string | null) {
    this.repo.registrarAcesso({ em: this.agoraIso(), usuario, evento, detalhe, ip });
  }

  ipDaTvPermitido(ip: string | null): boolean {
    return this.o.tvIps.contem(ip);
  }

  /** Cria o primeiro admin na primeira execução. Devolve a senha gerada, se precisou gerar uma. */
  async garantirAdminInicial(usuario: string, senhaInicial: string): Promise<string | null> {
    if (this.repo.contarUsuarios() > 0) return null;
    const senha = senhaInicial || gerarSenhaTemporaria();
    this.repo.criarUsuario({
      usuario,
      nome: nomeDoEmail(usuario),
      perfil: 'admin',
      equipe: null,
      hash: await gerarHash(senha, this.custo),
      em: this.agoraIso(),
    });
    this.registrar('sistema', 'Conta criada', `Primeiro admin: ${usuario}`);
    return senhaInicial ? null : senha;
  }

  // ---------- login, sessão e saída ----------

  async entrar(
    usuarioDigitado: string,
    senha: string,
    ipBruto?: string | null,
  ): Promise<{ token: string; sessao: SessaoAtual }> {
    const ip = normalizarIp(ipBruto);
    const agora = this.agora();
    const u = this.repo.usuarioPorNome(usuarioDigitado);
    const recusar = (motivo: string, mensagem: string, status = 401, codigo = 'CREDENCIAIS'): never => {
      this.registrar(usuarioDigitado, 'Tentativa recusada', motivo, ip);
      throw new ErroAcesso(status, codigo, mensagem);
    };

    if (!u) {
      // Gasta o mesmo tempo de uma conferência real para não revelar quais usuários existem.
      this.hashFalso ??= gerarHash(gerarSenhaTemporaria(), this.custo);
      await conferirSenha(senha, await this.hashFalso);
      return recusar('Usuário inexistente', 'Usuário ou senha incorretos.');
    }

    if (u.bloqueado_ate && Date.parse(u.bloqueado_ate) > agora.getTime()) {
      const min = Math.ceil((Date.parse(u.bloqueado_ate) - agora.getTime()) / 60000);
      return recusar(
        'Usuário bloqueado',
        `Usuário bloqueado por excesso de tentativas. Tente de novo em ${min} min.`,
        423,
        'BLOQUEADO',
      );
    }

    if (!(await conferirSenha(senha, u.senha_hash))) {
      const tentativas = u.tentativas + 1;
      if (tentativas >= MAX_TENTATIVAS) {
        const ate = new Date(agora.getTime() + BLOQUEIO_MIN * 60000).toISOString();
        this.repo.registrarFalha(u.id, 0, ate);
        this.registrar(u.usuario, 'Tentativa recusada', 'Senha incorreta', ip);
        this.registrar(
          u.usuario,
          'Bloqueado',
          `${MAX_TENTATIVAS} senhas erradas; bloqueado por ${BLOQUEIO_MIN} min`,
          ip,
        );
        this.o.log.warn({ usuario: u.usuario, ip }, 'Usuário bloqueado por excesso de tentativas');
        throw new ErroAcesso(
          423,
          'BLOQUEADO',
          `Usuário bloqueado por ${BLOQUEIO_MIN} min após ${MAX_TENTATIVAS} senhas erradas.`,
        );
      }
      this.repo.registrarFalha(u.id, tentativas, null);
      return recusar('Senha incorreta', 'Usuário ou senha incorretos.');
    }

    if (u.ativo !== 1)
      return recusar(
        'Conta desativada',
        'Esta conta está desativada. Fale com o administrador.',
        403,
        'DESATIVADA',
      );

    if (u.perfil === 'tv' && !this.ipDaTvPermitido(ip))
      return recusar(
        `IP não autorizado para o perfil tv (${ip ?? 'desconhecido'})`,
        'O perfil Tela TV só entra a partir da TV autorizada.',
        403,
        'IP_TV',
      );

    const token = randomBytes(32).toString('base64url');
    const sessaoId = hashToken(token);
    const em = agora.toISOString();
    this.repo.criarSessao(sessaoId, u.id, em, ip);
    this.repo.registrarEntrada(u.id, em);
    this.registrar(u.usuario, 'Entrou', null, ip);
    const atual = this.repo.usuarioPorId(u.id)!;
    return { token, sessao: this.descrever(atual, em) };
  }

  private descrever(u: LinhaUsuario, ultimoUso: string): SessaoAtual {
    return {
      usuario: usuarioPublico(u),
      expiraEm:
        u.perfil === 'tv' ? null : new Date(Date.parse(ultimoUso) + this.o.sessaoMin * 60000).toISOString(),
      sessaoMin: this.o.sessaoMin,
    };
  }

  /**
   * Valida a sessão do cookie. Com `renovar`, conta como uso e empurra a expiração.
   * Leituras automáticas (Socket.IO, fotografia do painel) não renovam: a sessão expira
   * depois de 15 min sem o usuário mexer na tela.
   */
  validar(
    token: string | undefined | null,
    opcoes: { renovar: boolean; ip?: string | null },
  ): ResultadoValidacao {
    if (!token) return { ok: false, codigo: 'SEM_SESSAO' };
    const s = this.repo.sessaoAberta(hashToken(token));
    if (!s) return { ok: false, codigo: 'SEM_SESSAO' };
    const u = this.repo.usuarioPorId(s.usuario_id);
    const agora = this.agora();
    if (!u || u.ativo !== 1) {
      this.repo.encerrarSessao(s.id, agora.toISOString(), 'conta desativada');
      return { ok: false, codigo: 'SEM_SESSAO' };
    }
    if (u.perfil === 'tv') {
      const ip = normalizarIp(opcoes.ip);
      if (opcoes.ip !== undefined && !this.ipDaTvPermitido(ip)) return { ok: false, codigo: 'SEM_SESSAO' };
    } else if (agora.getTime() - Date.parse(s.ultimo_uso) > this.o.sessaoMin * 60000) {
      this.expirar(s.id, u.usuario, s.ip);
      return { ok: false, codigo: 'SESSAO_EXPIRADA' };
    }
    let ultimoUso = s.ultimo_uso;
    if (opcoes.renovar) {
      ultimoUso = agora.toISOString();
      this.repo.tocarSessao(s.id, ultimoUso);
    }
    const d = this.descrever(u, ultimoUso);
    return { ok: true, sessao: { sessaoId: s.id, usuario: d.usuario, expiraEm: d.expiraEm } };
  }

  private expirar(sessaoId: string, usuario: string, ip: string | null) {
    this.repo.encerrarSessao(sessaoId, this.agoraIso(), 'expirada');
    this.registrar(usuario, 'Sessão expirada', `Sem uso por ${this.o.sessaoMin} min`, ip);
  }

  /** Expira sessões ociosas mesmo que ninguém volte a usá-las (para o log ficar completo). */
  varrerExpiradas(): number {
    const limite = new Date(this.agora().getTime() - this.o.sessaoMin * 60000).toISOString();
    const ociosas = this.repo.sessoesOciosas(limite);
    for (const s of ociosas) this.expirar(s.id, s.usuario, s.ip);
    return ociosas.length;
  }

  sair(sessao: SessaoValida, ip?: string | null) {
    this.repo.encerrarSessao(sessao.sessaoId, this.agoraIso(), 'saiu');
    this.registrar(sessao.usuario.usuario, 'Saiu', null, normalizarIp(ip));
  }

  async trocarSenha(sessao: SessaoValida, senhaAtual: string, novaSenha: string, ip?: string | null) {
    const u = this.repo.usuarioPorId(sessao.usuario.id)!;
    if (!(await conferirSenha(senhaAtual, u.senha_hash)))
      throw new ErroAcesso(400, 'SENHA_ATUAL', 'A senha atual não confere.');
    if (senhaAtual === novaSenha)
      throw new ErroAcesso(400, 'SENHA_IGUAL', 'A nova senha precisa ser diferente da atual.');
    this.repo.definirSenha(u.id, await gerarHash(novaSenha, this.custo), false);
    this.registrar(
      u.usuario,
      'Senha trocada',
      u.troca_senha ? 'Troca obrigatória concluída' : null,
      normalizarIp(ip),
    );
    return usuarioPublico(this.repo.usuarioPorId(u.id)!);
  }

  // ---------- administração de contas (só admin) ----------

  listarUsuarios(): UsuarioPublico[] {
    return this.repo.listarUsuarios().map(usuarioPublico);
  }

  async criarUsuario(admin: UsuarioPublico, dados: NovoUsuarioEntrada) {
    if (this.repo.usuarioPorNome(dados.usuario))
      throw new ErroAcesso(409, 'USUARIO_EXISTE', 'Já existe uma conta com esse usuário.');
    const senhaTemporaria = gerarSenhaTemporaria();
    const id = this.repo.criarUsuario({
      usuario: dados.usuario,
      nome: dados.nome,
      perfil: dados.perfil,
      equipe: dados.perfil === 'supervisor' ? (dados.equipe ?? null) : null,
      hash: await gerarHash(senhaTemporaria, this.custo),
      em: this.agoraIso(),
    });
    const equipe = dados.perfil === 'supervisor' ? `, equipe ${dados.equipe}` : '';
    this.registrar(admin.usuario, 'Conta criada', `${dados.usuario} (${dados.perfil}${equipe})`);
    return { usuario: usuarioPublico(this.repo.usuarioPorId(id)!), senhaTemporaria };
  }

  private alvo(id: number): LinhaUsuario {
    const u = this.repo.usuarioPorId(id);
    if (!u) throw new ErroAcesso(404, 'NAO_ENCONTRADO', 'Conta não encontrada.');
    return u;
  }

  definirAtivo(admin: UsuarioPublico, id: number, ativo: boolean): UsuarioPublico {
    const u = this.alvo(id);
    if (!ativo && u.id === admin.id)
      throw new ErroAcesso(400, 'PROPRIA_CONTA', 'Você não pode desativar a sua própria conta.');
    this.repo.definirAtivo(u.id, ativo);
    if (!ativo) this.repo.encerrarSessoesDoUsuario(u.id, this.agoraIso(), 'conta desativada');
    this.registrar(admin.usuario, ativo ? 'Conta reativada' : 'Conta desativada', u.usuario);
    return usuarioPublico(this.repo.usuarioPorId(u.id)!);
  }

  async novaSenha(admin: UsuarioPublico, id: number) {
    const u = this.alvo(id);
    const senhaTemporaria = gerarSenhaTemporaria();
    this.repo.definirSenha(u.id, await gerarHash(senhaTemporaria, this.custo), true);
    this.repo.encerrarSessoesDoUsuario(u.id, this.agoraIso(), 'senha redefinida');
    this.registrar(admin.usuario, 'Senha redefinida', u.usuario);
    return { usuario: usuarioPublico(this.repo.usuarioPorId(u.id)!), senhaTemporaria };
  }
}
