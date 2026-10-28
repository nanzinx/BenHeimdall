// Socket.IO: a cada ciclo de leitura, envia `painel:atualizado` a cada navegador, já projetado
// pelo perfil. O handshake exige sessão válida, e a sessão é conferida de novo a cada envio
// (sem renovar), então quem expira ou é desativado é desconectado.
import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import type { Painel } from '@benheimdall/shared';
import { tokenDoCabecalho } from './acesso/http';
import { ipDoCliente } from './acesso/ips';
import type { ServicoAcesso } from './acesso/servico';
import type { CicloLeitura } from './leitura/ciclo';
import type { Log } from './log';
import { projetarPainel, type Leitor } from './projecao';

export interface OpcoesSocket {
  servico: ServicoAcesso;
  ciclo: CicloLeitura;
  segredo: string;
  log: Log;
  /** O mesmo TRUST_PROXY do Express: o IP real vem de X-Forwarded-For quando o proxy é confiável. */
  confiarProxy: boolean | number | string;
  ipPermitido: (ip: string | null) => boolean;
}

export function ligarSocket(http: HttpServer, o: OpcoesSocket) {
  const io = new Server(http, {
    serveClient: false,
    // O Socket.IO não passa pelos middlewares do Express: confere aqui a lista de IPs.
    allowRequest: (req, cb) => cb(null, o.ipPermitido(ipDoCliente(req, o.confiarProxy))),
  });

  const conferir = (s: Socket) =>
    o.servico.validar(tokenDoCabecalho(s.handshake.headers.cookie, o.segredo), {
      renovar: false,
      ip: ipDoCliente(s.request, o.confiarProxy),
    });

  io.use((socket, next) => {
    const r = conferir(socket);
    if (!r.ok) return next(Object.assign(new Error(r.codigo), { data: { codigo: r.codigo } }));
    if (r.sessao.usuario.trocaSenha)
      return next(Object.assign(new Error('TROCA_SENHA'), { data: { codigo: 'TROCA_SENHA' } }));
    next();
  });

  io.on('connection', (socket) => {
    const r = conferir(socket);
    if (!r.ok) return void socket.disconnect(true);
    socket.emit('painel:atualizado', projetarPainel(o.ciclo.painelAtual(), r.sessao.usuario));
  });

  o.ciclo.on('painel', () => {
    const painel = o.ciclo.painelAtual();
    const cache = new Map<string, Painel>();
    const projetar = (l: Leitor) => {
      const chave = `${l.perfil}:${l.equipe ?? ''}`;
      let p = cache.get(chave);
      if (!p) cache.set(chave, (p = projetarPainel(painel, l)));
      return p;
    };
    for (const socket of io.sockets.sockets.values()) {
      const r = conferir(socket);
      if (!r.ok || r.sessao.usuario.trocaSenha) {
        socket.emit('sessao:encerrada', { codigo: r.ok ? 'TROCA_SENHA' : r.codigo });
        socket.disconnect(true);
        continue;
      }
      socket.emit('painel:atualizado', projetar(r.sessao.usuario));
    }
  });

  return io;
}
