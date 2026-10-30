import { Router } from 'express';
import { loginSchema, trocarSenhaSchema, type SessaoAtual } from '@benheimdall/shared';
import { COOKIE_SESSAO, exigirSessao, opcoesCookie, sessaoDe } from '../acesso/http';
import type { ServicoAcesso, SessaoValida } from '../acesso/servico';

export function rotasSessao(servico: ServicoAcesso, producao: boolean) {
  const r = Router();
  const cookie = opcoesCookie(producao);
  const atual = (s: SessaoValida): SessaoAtual => ({
    usuario: s.usuario,
    expiraEm: s.expiraEm,
    sessaoMin: servico.sessaoMin,
    ...(servico.acessoLivre ? { acessoLivre: true } : {}),
  });

  r.post('/entrar', async (req, res) => {
    const { usuario, senha } = loginSchema.parse(req.body);
    const { token, sessao } = await servico.entrar(usuario, senha, req.ip);
    res.cookie(COOKIE_SESSAO, token, cookie).json(sessao);
  });

  // Rotas da própria sessão funcionam mesmo com a troca de senha pendente.
  const pendente = { comTrocaPendente: true };

  r.get('/', exigirSessao(servico, producao, { renovar: false, ...pendente }), (_req, res) => {
    res.json(atual(sessaoDe(res)));
  });

  r.post('/renovar', exigirSessao(servico, producao, { renovar: true, ...pendente }), (_req, res) => {
    res.json(atual(sessaoDe(res)));
  });

  r.post('/sair', exigirSessao(servico, producao, { renovar: false, ...pendente }), (req, res) => {
    if (!servico.acessoLivre) servico.sair(sessaoDe(res), req.ip);
    res
      .clearCookie(COOKIE_SESSAO, { ...cookie, signed: undefined })
      .status(204)
      .end();
  });

  r.post(
    '/trocar-senha',
    exigirSessao(servico, producao, { renovar: true, ...pendente }),
    async (req, res) => {
      const { senhaAtual, novaSenha } = trocarSenhaSchema.parse(req.body);
      const s = sessaoDe(res);
      const usuario = await servico.trocarSenha(s, senhaAtual, novaSenha, req.ip);
      res.json(atual({ ...s, usuario }));
    },
  );

  return r;
}
