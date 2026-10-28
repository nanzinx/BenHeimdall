import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { criarListaIps, lerListaIps } from '../src/acesso/ips';
import { criarAmbiente } from './ajuda';

const LISTA =
  '2804:431:80f7:7700::/48, 2804:1b3:a5e7:c3c7::/48, 201.93.163.133, 2804:1b3:a5e7:2c83::/48, 201.93.159.169, 2804:1b3:a5e7:8e38::/48';

describe('lista de IPs', () => {
  const ips = criarListaIps(lerListaIps(LISTA));

  it('aceita IPv4 exatos e faixas IPv6 /48', () => {
    expect(ips.contem('201.93.163.133')).toBe(true);
    expect(ips.contem('::ffff:201.93.159.169')).toBe(true);
    expect(ips.contem('2804:431:80f7:1:2:3:4:5')).toBe(true); // dentro de 2804:431:80f7::/48
    expect(ips.contem('2804:1b3:a5e7:ffff::1')).toBe(true);
  });

  it('recusa o resto', () => {
    expect(ips.contem('201.93.163.134')).toBe(false);
    expect(ips.contem('2804:431:80f8::1')).toBe(false);
    expect(ips.contem('8.8.8.8')).toBe(false);
    expect(ips.contem(null)).toBe(false);
    expect(ips.contem('lixo')).toBe(false);
  });

  it('configuração inválida derruba a partida', () => {
    expect(() => criarListaIps(['999.1.1.1'])).toThrow(/IP inválido/);
    expect(() => criarListaIps(['10.0.0.0/40'])).toThrow(/Prefixo inválido/);
  });
});

describe('IPS_PERMITIDOS na API', () => {
  it('só os IPs da lista (e a própria máquina) entram; o IP real vem do proxy confiável', async () => {
    const amb = criarAmbiente({ ipsPermitidos: LISTA, trustProxy: 'loopback' });
    const { app, io, http } = amb.criar();
    try {
      // Requisição local (sem proxy na frente): loopback sempre entra.
      expect((await request(app).get('/api/saude')).status).toBe(200);
      // Via túnel/proxy local: vale o IP do cliente em X-Forwarded-For.
      const de = (ip: string) => request(app).get('/api/saude').set('X-Forwarded-For', ip);
      expect((await de('201.93.163.133')).status).toBe(200);
      expect((await de('2804:1b3:a5e7:c3c7::99')).status).toBe(200);
      const negado = await de('8.8.8.8');
      expect(negado.status).toBe(403);
      expect(negado.text).toMatch(/não permitido/);
      expect((await request(app).post('/api/sessao/entrar').set('X-Forwarded-For', '8.8.8.8')).status).toBe(
        403,
      );
    } finally {
      void io.close();
      http.close();
    }
  });
});
