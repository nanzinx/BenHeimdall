// Listas de IPs permitidos (acesso geral e Tela TV), com IPv4/IPv6 e faixas CIDR (ex.: /48).
import type { IncomingMessage } from 'node:http';
import { BlockList, isIP } from 'node:net';
import proxyaddr from 'proxy-addr';

/** `::ffff:127.0.0.1` → `127.0.0.1`. */
export function normalizarIp(ip: string | undefined | null): string | null {
  if (!ip) return null;
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

export interface ListaIps {
  /** Entradas como foram configuradas (para log e mensagens). */
  readonly entradas: readonly string[];
  /** Lista vazia = ninguém (use `vaziaPermiteTodos` para decidir o contrário). */
  contem(ip: string | null | undefined): boolean;
}

/** Monta a lista a partir de entradas como `201.93.163.133` ou `2804:431:80f7:7700::/48`. */
export function criarListaIps(entradas: readonly string[]): ListaIps {
  const lista = new BlockList();
  for (const bruta of entradas) {
    const [endereco = '', prefixo] = bruta.split('/');
    const tipo = isIP(endereco);
    if (!tipo) throw new Error(`IP inválido na configuração: "${bruta}"`);
    const familia = tipo === 4 ? 'ipv4' : 'ipv6';
    if (prefixo === undefined) {
      lista.addAddress(endereco, familia);
      continue;
    }
    const bits = Number(prefixo);
    if (!Number.isInteger(bits) || bits < 0 || bits > (tipo === 4 ? 32 : 128))
      throw new Error(`Prefixo inválido na configuração: "${bruta}"`);
    lista.addSubnet(endereco, bits, familia);
  }
  return {
    entradas,
    contem(ipBruto) {
      const ip = normalizarIp(ipBruto);
      if (!ip) return false;
      const tipo = isIP(ip);
      if (!tipo) return false;
      return lista.check(ip, tipo === 4 ? 'ipv4' : 'ipv6');
    },
  };
}

export function lerListaIps(texto: string): string[] {
  return texto
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const LOOPBACK = criarListaIps(['127.0.0.0/8', '::1/128']);

export function ehLoopback(ip: string | null | undefined): boolean {
  return LOOPBACK.contem(ip);
}

/**
 * IP real do cliente, respeitando TRUST_PROXY como o Express faz (`req.ip`).
 * Usado no handshake do Socket.IO, que não passa pelos middlewares do Express.
 */
export function ipDoCliente(req: IncomingMessage, confiar: boolean | number | string): string | null {
  const fn =
    confiar === false
      ? () => false
      : confiar === true
        ? () => true
        : typeof confiar === 'number'
          ? (_a: string, i: number) => i < confiar
          : proxyaddr.compile(confiar.split(',').map((s) => s.trim()));
  return normalizarIp(proxyaddr(req, fn));
}
