import { describe, expect, it } from 'vitest';
import { ErroAcesso } from '../src/acesso/servico';
import { contaPronta, criarAmbiente } from './ajuda';

function relogio(inicio = '2026-03-02T12:00:00Z') {
  let t = Date.parse(inicio);
  return { agora: () => new Date(t), avancar: (min: number) => (t += min * 60_000) };
}

const eventos = (amb: ReturnType<typeof criarAmbiente>) =>
  amb.servico.repo
    .listarAcessos(100)
    .map((a) => a.evento)
    .reverse();

describe('login', () => {
  it('bloqueia o usuário por 5 min após 5 senhas erradas', async () => {
    const r = relogio();
    const amb = criarAmbiente({ agora: r.agora });
    const { senha } = await contaPronta(amb.servico, { usuario: 'sup.um', perfil: 'supervisor', equipe: 1 });

    for (let i = 1; i <= 4; i++)
      await expect(amb.servico.entrar('sup.um', 'errada')).rejects.toMatchObject({ codigo: 'CREDENCIAIS' });
    await expect(amb.servico.entrar('sup.um', 'errada')).rejects.toMatchObject({
      status: 423,
      codigo: 'BLOQUEADO',
    });
    // Bloqueado: nem a senha certa entra.
    await expect(amb.servico.entrar('sup.um', senha)).rejects.toMatchObject({ codigo: 'BLOQUEADO' });

    r.avancar(4);
    await expect(amb.servico.entrar('sup.um', senha)).rejects.toMatchObject({ codigo: 'BLOQUEADO' });
    r.avancar(1.01);
    await expect(amb.servico.entrar('sup.um', senha)).resolves.toHaveProperty('token');
    expect(eventos(amb)).toContain('Bloqueado');
  });

  it('acerto zera a contagem de erros', async () => {
    const amb = criarAmbiente();
    const { senha } = await contaPronta(amb.servico, {
      usuario: 'sup.dois',
      perfil: 'supervisor',
      equipe: 2,
    });
    for (let i = 0; i < 4; i++)
      await expect(amb.servico.entrar('sup.dois', 'x')).rejects.toBeInstanceOf(ErroAcesso);
    await amb.servico.entrar('sup.dois', senha);
    for (let i = 0; i < 4; i++)
      await expect(amb.servico.entrar('sup.dois', 'x')).rejects.toMatchObject({ codigo: 'CREDENCIAIS' });
  });

  it('expira a sessão após 15 min sem uso, e o uso renova', async () => {
    const r = relogio();
    const amb = criarAmbiente({ agora: r.agora });
    const { senha } = await contaPronta(amb.servico, {
      usuario: 'sup.tres',
      perfil: 'supervisor',
      equipe: 3,
    });
    const { token } = await amb.servico.entrar('sup.tres', senha);

    r.avancar(14);
    expect(amb.servico.validar(token, { renovar: true }).ok).toBe(true); // uso renova
    r.avancar(14);
    expect(amb.servico.validar(token, { renovar: false }).ok).toBe(true); // leitura automática não renova
    r.avancar(1.5);
    expect(amb.servico.validar(token, { renovar: false })).toEqual({ ok: false, codigo: 'SESSAO_EXPIRADA' });
    expect(amb.servico.validar(token, { renovar: true }).ok).toBe(false); // continua encerrada
    expect(eventos(amb)).toContain('Sessão expirada');
  });

  it('a varredura expira e registra sessões abandonadas', async () => {
    const r = relogio();
    const amb = criarAmbiente({ agora: r.agora });
    const { senha } = await contaPronta(amb.servico, {
      usuario: 'sup.quatro',
      perfil: 'supervisor',
      equipe: 4,
    });
    await amb.servico.entrar('sup.quatro', senha);
    r.avancar(16);
    expect(amb.servico.varrerExpiradas()).toBe(1);
    expect(eventos(amb).filter((e) => e === 'Sessão expirada')).toHaveLength(1);
  });

  it('perfil tv não expira, mas só entra dos IPs permitidos', async () => {
    const r = relogio();
    const amb = criarAmbiente({ agora: r.agora, tvIps: '10.0.0.50' });
    const { senha } = await contaPronta(amb.servico, { usuario: 'tv.salao', perfil: 'tv' });
    await expect(amb.servico.entrar('tv.salao', senha, '10.0.0.99')).rejects.toMatchObject({
      codigo: 'IP_TV',
    });
    const { token, sessao } = await amb.servico.entrar('tv.salao', senha, '::ffff:10.0.0.50');
    expect(sessao.expiraEm).toBeNull();
    r.avancar(60 * 24);
    expect(amb.servico.validar(token, { renovar: false, ip: '10.0.0.50' }).ok).toBe(true);
    expect(amb.servico.validar(token, { renovar: false, ip: '10.0.0.99' }).ok).toBe(false);
  });

  it('conta desativada é recusada e perde as sessões abertas', async () => {
    const amb = criarAmbiente();
    const { id, senha } = await contaPronta(amb.servico, {
      usuario: 'sup.cinco',
      perfil: 'supervisor',
      equipe: 5,
    });
    const adminConta = await contaPronta(amb.servico, { usuario: 'chefe', perfil: 'admin' });
    const { sessao: sAdmin } = await amb.servico.entrar('chefe', adminConta.senha);
    const { token } = await amb.servico.entrar('sup.cinco', senha);

    amb.servico.definirAtivo(sAdmin.usuario, id, false);
    expect(amb.servico.validar(token, { renovar: true }).ok).toBe(false);
    await expect(amb.servico.entrar('sup.cinco', senha)).rejects.toMatchObject({
      status: 403,
      codigo: 'DESATIVADA',
    });

    amb.servico.definirAtivo(sAdmin.usuario, id, true);
    await expect(amb.servico.entrar('sup.cinco', senha)).resolves.toHaveProperty('token');
    expect(eventos(amb)).toEqual(
      expect.arrayContaining(['Conta desativada', 'Conta reativada', 'Tentativa recusada']),
    );
  });

  it('o admin não pode desativar a própria conta', async () => {
    const amb = criarAmbiente();
    const { id, senha } = await contaPronta(amb.servico, { usuario: 'chefe', perfil: 'admin' });
    const { sessao } = await amb.servico.entrar('chefe', senha);
    expect(() => amb.servico.definirAtivo(sessao.usuario, id, false)).toThrow(/própria conta/);
  });

  it('conta nova e senha redefinida exigem troca no primeiro acesso', async () => {
    const amb = criarAmbiente();
    const adminConta = await contaPronta(amb.servico, { usuario: 'chefe', perfil: 'admin' });
    const { sessao: sAdmin } = await amb.servico.entrar('chefe', adminConta.senha);
    const { usuario, senhaTemporaria } = await amb.servico.criarUsuario(sAdmin.usuario, {
      nome: 'Juliana',
      usuario: 'sup.juliana',
      perfil: 'supervisor',
      equipe: 1,
    });
    expect(usuario.trocaSenha).toBe(true);

    const login = await amb.servico.entrar('sup.juliana', senhaTemporaria);
    expect(login.sessao.usuario.trocaSenha).toBe(true);
    const valida = amb.servico.validar(login.token, { renovar: true });
    if (!valida.ok) throw new Error('sessão deveria ser válida');
    await expect(
      amb.servico.trocarSenha(valida.sessao, senhaTemporaria, senhaTemporaria),
    ).rejects.toMatchObject({ codigo: 'SENHA_IGUAL' });
    await expect(amb.servico.trocarSenha(valida.sessao, 'errada', 'nova-senha-123')).rejects.toMatchObject({
      codigo: 'SENHA_ATUAL',
    });
    const trocado = await amb.servico.trocarSenha(valida.sessao, senhaTemporaria, 'nova-senha-123');
    expect(trocado.trocaSenha).toBe(false);

    const { senhaTemporaria: outra } = await amb.servico.novaSenha(sAdmin.usuario, usuario.id);
    expect(amb.servico.validar(login.token, { renovar: false }).ok).toBe(false); // sessões antigas caem
    await expect(amb.servico.entrar('sup.juliana', 'nova-senha-123')).rejects.toBeInstanceOf(ErroAcesso);
    expect((await amb.servico.entrar('sup.juliana', outra)).sessao.usuario.trocaSenha).toBe(true);
  });

  it('cria o primeiro admin uma única vez, com troca obrigatória', async () => {
    const amb = criarAmbiente();
    expect(await amb.servico.garantirAdminInicial('admin', 'senha-inicial')).toBeNull();
    expect(await amb.servico.garantirAdminInicial('admin', 'outra')).toBeNull();
    const lista = amb.servico.listarUsuarios();
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ usuario: 'admin', perfil: 'admin', trocaSenha: true });
    await expect(amb.servico.entrar('admin', 'senha-inicial')).resolves.toHaveProperty('token');
  });
});
