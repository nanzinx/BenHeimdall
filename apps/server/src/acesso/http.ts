// Middleware de sessão para o Express e leitura do cookie no handshake do Socket.IO.
import type { CookieOptions, NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import { parse as lerCookies } from 'cookie';
import type { Perfil } from '@benheimdall/shared';
import { pedidoLocal } from './ips';
import type { ServicoAcesso, SessaoValida } from './servico';

export const COOKIE_SESSAO = 'bh_sessao';

export function opcoesCookie(producao: boolean): CookieOptions {
  return { httpOnly: true, secure: producao, sameSite: 'strict', path: '/', signed: true };
}

export function tokenDoPedido(req: Request): string | null {
  const v = (req.signedCookies as Record<string, unknown> | undefined)?.[COOKIE_SESSAO];
  return typeof v === 'string' ? v : null;
}

/** Token assinado de um cabeçalho Cookie bruto (handshake do Socket.IO). */
export function tokenDoCabecalho(cabecalho: string | undefined, segredo: string): string | null {
  if (!cabecalho) return null;
  const bruto = lerCookies(cabecalho)[COOKIE_SESSAO];
  if (!bruto) return null;
  const v = cookieParser.signedCookie(bruto, segredo);
  return typeof v === 'string' ? v : null;
}

export function sessaoDe(res: Response): SessaoValida {
  return res.locals.sessao as SessaoValida;
}

export interface OpcoesExigir {
  /** Conta como uso do usuário e empurra a expiração da sessão. */
  renovar: boolean;
  perfis?: Perfil[];
  /** Permite o acesso mesmo com a troca de senha pendente (rotas da própria sessão). */
  comTrocaPendente?: boolean;
}

export function exigirSessao(servico: ServicoAcesso, producao: boolean, o: OpcoesExigir) {
  return (req: Request, res: Response, next: NextFunction) => {
    const r = servico.validar(tokenDoPedido(req), {
      renovar: o.renovar,
      ip: req.ip ?? null,
      local: pedidoLocal(req),
    });
    if (!r.ok) {
      res.clearCookie(COOKIE_SESSAO, { ...opcoesCookie(producao), signed: undefined });
      const mensagem =
        r.codigo === 'SESSAO_EXPIRADA'
          ? 'Sua sessão expirou por inatividade. Entre de novo.'
          : 'Entre para continuar.';
      res.status(401).json({ codigo: r.codigo, mensagem });
      return;
    }
    if (r.sessao.usuario.trocaSenha && !o.comTrocaPendente) {
      res.status(403).json({ codigo: 'TROCA_SENHA', mensagem: 'Troque a senha temporária para continuar.' });
      return;
    }
    if (o.perfis && !o.perfis.includes(r.sessao.usuario.perfil)) {
      res.status(403).json({ codigo: 'PERFIL', mensagem: 'Seu perfil não tem acesso a esta função.' });
      return;
    }
    res.locals.sessao = r.sessao;
    next();
  };
}
