import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { io as conectar, type Socket } from 'socket.io-client';
import type { Painel } from '@benheimdall/shared';
import { contaPronta, criarAmbiente } from './ajuda';

const cookieDe = (res: request.Response) => {
  const c = res.headers['set-cookie'] as unknown as string[] | undefined;
  return c?.[0]?.split(';')[0] ?? '';
};

const fechar: (() => void)[] = [];
afterEach(() => {
  while (fechar.length) fechar.pop()!();
});

async function preparar(acessoLivre = false) {
  const amb = criarAmbiente({ acessoLivre });
  await amb.ciclo.executar();
  const { app, http, io } = amb.criar();
  fechar.push(() => {
    void io.close();
    http.close();
  });
  const entrar = async (usuario: string, senha: string) => {
    const res = await request(app).post('/api/sessao/entrar').send({ usuario, senha });
    return { res, cookie: cookieDe(res) };
  };
  return { amb, app, http, entrar };
}

describe('API', () => {
  it('acesso livre (PC): painel e sessão sem login, como administrador', async () => {
    const { app } = await preparar(true);
    expect((await request(app).get('/api/painel')).status).toBe(200);
    const sessao = await request(app).get('/api/sessao');
    expect(sessao.status).toBe(200);
    expect(sessao.body).toMatchObject({ acessoLivre: true, usuario: { perfil: 'admin' } });
    expect((await request(app).post('/api/sessao/sair')).status).toBeLessThan(300);
    expect((await request(app).get('/api/usuarios')).status).toBe(200);
    // Por túnel (ngrok, Cloudflare) o acesso livre não vale: pede login.
    const tunel = { 'X-Forwarded-For': '201.93.163.133, 127.0.0.1', Host: 'x.ngrok-free.dev' };
    expect((await request(app).get('/api/painel').set(tunel)).status).toBe(401);
    expect((await request(app).get('/api/sessao').set({ Host: 'x.ngrok-free.dev' })).status).toBe(401);
  });

  it('sem sessão, o painel responde 401; o cookie é httpOnly e SameSite=Strict', async () => {
    const { amb, app, entrar } = await preparar();
    expect((await request(app).get('/api/painel')).status).toBe(401);
    const { senha } = await contaPronta(amb.servico, { usuario: 'sup.um', perfil: 'supervisor', equipe: 1 });
    const { res } = await entrar('sup.um', senha);
    expect(res.status).toBe(200);
    const setCookie = String(res.headers['set-cookie']);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Strict/);
  });

  it('GET /api/painel já vem projetado pelo perfil', async () => {
    const { amb, app, entrar } = await preparar();
    const sup = await contaPronta(amb.servico, { usuario: 'sup.um', perfil: 'supervisor', equipe: 1 });
    const tv = await contaPronta(amb.servico, { usuario: 'tv.salao', perfil: 'tv' });

    const { cookie: cSup } = await entrar('sup.um', sup.senha);
    const pSup = (await request(app).get('/api/painel').set('Cookie', cSup)).body as Painel;
    expect(pSup.agentes).toHaveLength(48);
    expect(
      pSup.agentes
        .filter((a) => a.equipe !== 1 && a.atendimento)
        .every((a) => a.atendimento!.restrito && !a.atendimento!.clienteMascarado),
    ).toBe(true);

    const { cookie: cTv } = await entrar('tv.salao', tv.senha);
    const pTv = (await request(app).get('/api/painel').set('Cookie', cTv)).body as Painel;
    expect(pTv.agentes.every((a) => !a.atendimento && !a.pausa?.motivo)).toBe(true);
    expect((await request(app).get('/api/usuarios').set('Cookie', cTv)).status).toBe(403);
  });

  it('com troca de senha pendente, só as rotas da sessão funcionam', async () => {
    const { app, amb, entrar } = await preparar();
    await amb.servico.garantirAdminInicial('admin', 'senha-inicial');
    const { cookie } = await entrar('admin', 'senha-inicial');
    expect((await request(app).get('/api/painel').set('Cookie', cookie)).body.codigo).toBe('TROCA_SENHA');
    const troca = await request(app)
      .post('/api/sessao/trocar-senha')
      .set('Cookie', cookie)
      .send({ senhaAtual: 'senha-inicial', novaSenha: 'curta' });
    expect(troca.status).toBe(400);
    await request(app)
      .post('/api/sessao/trocar-senha')
      .set('Cookie', cookie)
      .send({ senhaAtual: 'senha-inicial', novaSenha: 'senha-nova-longa' })
      .expect(200);
    expect((await request(app).get('/api/painel').set('Cookie', cookie)).status).toBe(200);
  });

  it('admin cria conta e vê o log; supervisor não acessa a administração', async () => {
    const { app, amb, entrar } = await preparar();
    const adm = await contaPronta(amb.servico, { usuario: 'chefe', perfil: 'admin' });
    const sup = await contaPronta(amb.servico, { usuario: 'sup.um', perfil: 'supervisor', equipe: 1 });
    const { cookie } = await entrar('chefe', adm.senha);
    const criada = await request(app)
      .post('/api/usuarios')
      .set('Cookie', cookie)
      .send({ nome: 'Juliana', usuario: 'juliana.mendes@benconsig.com', perfil: 'supervisor', equipe: 2 });
    expect(criada.status).toBe(201);
    expect(criada.body.senhaTemporaria).toHaveLength(10);
    const semEquipe = await request(app)
      .post('/api/usuarios')
      .set('Cookie', cookie)
      .send({ nome: 'X', usuario: 'sup.x@benconsig.com', perfil: 'supervisor' });
    expect(semEquipe.status).toBe(400);
    // Login padronizado por e-mail: nome de usuário solto é recusado.
    const semEmail = await request(app)
      .post('/api/usuarios')
      .set('Cookie', cookie)
      .send({ nome: 'X', usuario: 'sup.solto', perfil: 'supervisor', equipe: 1 });
    expect(semEmail.status).toBe(400);
    expect(semEmail.body.mensagem).toMatch(/e-mail válido/);
    // E-mail com maiúsculas é guardado em minúsculas e entra digitado de qualquer jeito.
    const tv = await request(app)
      .post('/api/usuarios')
      .set('Cookie', cookie)
      .send({ nome: 'TV', usuario: 'TV.Salao@Benconsig.com', perfil: 'tv' });
    expect(tv.body.usuario.usuario).toBe('tv.salao@benconsig.com');
    const { res: entrouTv } = await entrar('Tv.Salao@BENCONSIG.com', tv.body.senhaTemporaria);
    expect(entrouTv.status).toBe(200);
    const log = await request(app).get('/api/acessos').set('Cookie', cookie);
    expect(log.body.map((l: { evento: string }) => l.evento)).toContain('Conta criada');

    const { cookie: cSup } = await entrar('sup.um', sup.senha);
    expect((await request(app).get('/api/usuarios').set('Cookie', cSup)).status).toBe(403);
  });

  it('transferência: abre o pop-up só de quem está em ligação, só da própria equipe, e fica no log', async () => {
    const { amb, app, entrar } = await preparar();
    const agentes = amb.ciclo.painelAtual().agentes;
    const emLigacao = agentes.find((a) => a.status === 'ATENDENDO' && a.equipe > 0)!;
    const semLigacao = agentes.find((a) => a.status !== 'ATENDENDO' && a.equipe === emLigacao.equipe);
    const outraEquipe = emLigacao.equipe === 1 ? 2 : 1;
    const url = (id: string) => `/api/agentes/${id}/transferencia`;

    const dono = await contaPronta(amb.servico, {
      usuario: 'sup.dono',
      perfil: 'supervisor',
      equipe: emLigacao.equipe,
    });
    const outro = await contaPronta(amb.servico, {
      usuario: 'sup.outro',
      perfil: 'supervisor',
      equipe: outraEquipe,
    });
    const tv = await contaPronta(amb.servico, { usuario: 'tv.sala', perfil: 'tv' });
    const cDono = (await entrar('sup.dono', dono.senha)).cookie;
    const cOutro = (await entrar('sup.outro', outro.senha)).cookie;
    const cTv = (await entrar('tv.sala', tv.senha)).cookie;

    expect((await request(app).post(url(emLigacao.id))).status).toBe(401);
    expect((await request(app).post(url(emLigacao.id)).set('Cookie', cTv)).status).toBe(403);
    const r403 = await request(app).post(url(emLigacao.id)).set('Cookie', cOutro);
    expect(r403.body.codigo).toBe('OUTRA_EQUIPE');
    if (semLigacao)
      expect((await request(app).post(url(semLigacao.id)).set('Cookie', cDono)).body.codigo).toBe(
        'SEM_LIGACAO',
      );

    const ok = await request(app).post(url(emLigacao.id)).set('Cookie', cDono);
    expect(ok.status).toBe(200);
    expect(amb.argus.transferenciasAbertas).toEqual([emLigacao.ramal]);
    expect((await request(app).post(url(emLigacao.id)).set('Cookie', cDono)).status).toBe(429);
    expect(amb.argus.transferenciasAbertas).toHaveLength(1);
    expect(amb.servico.repo.listarAcessos(5).some((l) => l.evento === 'TRANSFERENCIA')).toBe(true);
  });

  it('Socket.IO recusa handshake sem sessão e entrega painel:atualizado com sessão', async () => {
    const { amb, http, entrar } = await preparar();
    await new Promise<void>((ok) => http.listen(0, '127.0.0.1', ok));
    const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
    const abrir = (cookie?: string): Socket => {
      const s = conectar(url, {
        transports: ['websocket'],
        extraHeaders: cookie ? { Cookie: cookie } : {},
        reconnection: false,
      });
      fechar.push(() => s.close());
      return s;
    };

    const erro = await new Promise<Error>((ok) => abrir().on('connect_error', ok));
    expect(erro.message).toBe('SEM_SESSAO');

    const tv = await contaPronta(amb.servico, { usuario: 'tv.salao', perfil: 'tv' });
    const { cookie } = await entrar('tv.salao', tv.senha);
    const s = abrir(cookie);
    const primeiro = await new Promise<Painel>((ok) => s.once('painel:atualizado', ok));
    expect(primeiro.agentes).toHaveLength(48);
    expect(primeiro.agentes.every((a) => !a.atendimento)).toBe(true);

    // A cada ciclo de leitura, chega uma atualização nova.
    const proximo = new Promise<Painel>((ok) => s.once('painel:atualizado', ok));
    await amb.ciclo.executar();
    expect((await proximo).agentes).toHaveLength(48);
  });
});
