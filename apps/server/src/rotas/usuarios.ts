import { Router } from 'express';
import { z } from 'zod';
import { novoUsuarioSchema } from '@benheimdall/shared';
import { exigirSessao, sessaoDe } from '../acesso/http';
import type { ServicoAcesso } from '../acesso/servico';

const idSchema = z.coerce.number().int().positive();
const limiteSchema = z.coerce.number().int().min(1).max(1000).default(200);

export function rotasUsuarios(servico: ServicoAcesso, producao: boolean) {
  const r = Router();
  r.use(exigirSessao(servico, producao, { renovar: true, perfis: ['admin'] }));

  r.get('/usuarios', (_req, res) => {
    res.json(servico.listarUsuarios());
  });

  r.post('/usuarios', async (req, res) => {
    const dados = novoUsuarioSchema.parse(req.body);
    res.status(201).json(await servico.criarUsuario(sessaoDe(res).usuario, dados));
  });

  r.post('/usuarios/:id/desativar', (req, res) => {
    res.json(servico.definirAtivo(sessaoDe(res).usuario, idSchema.parse(req.params.id), false));
  });

  r.post('/usuarios/:id/reativar', (req, res) => {
    res.json(servico.definirAtivo(sessaoDe(res).usuario, idSchema.parse(req.params.id), true));
  });

  r.post('/usuarios/:id/nova-senha', async (req, res) => {
    res.json(await servico.novaSenha(sessaoDe(res).usuario, idSchema.parse(req.params.id)));
  });

  r.get('/acessos', (req, res) => {
    res.json(servico.repo.listarAcessos(limiteSchema.parse(req.query.limite)));
  });

  return r;
}
