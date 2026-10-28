# BenHeimdall

Painel web de monitoramento em tempo real do call center da Benconsig (crédito consignado).
Mostra numa única tela, que se atualiza sozinha, quem está **atendendo**, **tabulando**, **em pausa**
(com alerta a 80% e a 100% do limite), **livre para transferência** e **offline**, além do mapa do
salão e do detalhe de cada agente.

O painel **só lê dados**: não transfere, não pausa e não desloga ninguém.

> **Fase 1:** o sistema está completo com uma **Argus simulada** (`ARGUS_MODE=mock`). A ligação com
> a API real da Argus (Fase 2) fica concentrada em um único arquivo:
> `packages/argus-client/src/real/RealArgusClient.ts`.

---

## Sumário

- [Requisitos](#requisitos)
- [Instalação e desenvolvimento](#instalação-e-desenvolvimento)
- [Validação no seu PC](#validação-no-seu-pc)
- [Comandos](#comandos)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Perfis e acesso](#perfis-e-acesso)
- [Restrição por IP](#restrição-por-ip)
- [Publicação no Cloudflare (Tunnel)](#publicação-no-cloudflare-tunnel)
- [Produção com PM2](#produção-com-pm2)
- [Produção com Docker (imagem endurecida)](#produção-com-docker-imagem-endurecida)
- [Proxy reverso e HTTPS](#proxy-reverso-e-https)
- [Como trocar `ARGUS_MODE` para `real`](#como-trocar-argus_mode-para-real)
- [O que falta para a Fase 2](#o-que-falta-para-a-fase-2)
- [Arquitetura](#arquitetura)
- [Decisões tomadas](#decisões-tomadas)

---

## Requisitos

- Node.js **20 ou mais novo** (testado com 20 e 22)
- pnpm **10** (`corepack enable` já ativa a versão certa, definida em `package.json`)
- Windows, macOS ou Linux. O `better-sqlite3` e o `bcrypt` baixam binários prontos na instalação;
  só se não houver binário para a sua versão do Node é preciso compilar (Linux/macOS: `python3`,
  `make` e `g++`; Windows: "Visual Studio Build Tools" com C++). Instalar com Node 20 ou 22 LTS evita isso.

## Instalação e desenvolvimento

```bash
cp .env.example .env
```

```bash
pnpm install
```

```bash
pnpm dev
```

- Front: <http://localhost:5173> (o Vite repassa `/api` e `/socket.io` para o backend)
- Backend: <http://localhost:3001>

No primeiro acesso, entre com `ADMIN_USER` / `ADMIN_SENHA_INICIAL` do `.env` (padrão:
`admin` / `troque-no-primeiro-acesso`). O sistema exige a troca da senha logo em seguida. Depois,
crie supervisores e a conta da TV em **Usuários e acessos**.

**Simular a queda da Argus:** no modo mock, use o botão **Simular queda da Argus (15 s)** no topo
do painel (ou `POST /api/dev/argus/queda` com `{ "segundos": 15 }`). Para começar já com a Argus
fora do ar, use `ARGUS_MOCK_FALHA=true`. O aviso aparece e o painel volta sozinho.

## Validação no seu PC

Para validar o sistema na sua máquina (Windows, macOS ou Linux), com a Argus simulada:

1. Instale o [Node.js 22 LTS](https://nodejs.org) e ative o pnpm:

   ```bash
   corepack enable
   ```

2. Clone o repositório, entre na pasta e copie o modelo de configuração:

   ```bash
   git clone https://github.com/nanzinx/BenHeimdall.git && cd BenHeimdall
   ```

   ```bash
   cp .env.example .env
   ```

   No PowerShell do Windows, o segundo comando é `Copy-Item .env.example .env`.

3. Instale e suba:

   ```bash
   pnpm install
   ```

   ```bash
   pnpm dev
   ```

4. Abra <http://localhost:5173>, entre com `admin` / `troque-no-primeiro-acesso` e troque a senha.

O acesso pela própria máquina (`localhost`) sempre entra, mesmo com `IPS_PERMITIDOS` preenchido.

**Mostrar para outra pessoa sem publicar nada:** com o
[`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
instalado, rode em outro terminal, com o `pnpm dev` no ar:

```bash
pnpm dev:tunel
```

Ele imprime um endereço `https://<algo>.trycloudflare.com` temporário, que aponta para o seu
`pnpm dev`. Quem abrir esse endereço só entra se o IP estiver em `IPS_PERMITIDOS`. O endereço
muda a cada execução.

## Comandos

| Comando           | O que faz                                                                   |
| ----------------- | --------------------------------------------------------------------------- |
| `pnpm dev`        | Sobe backend (tsx watch) e front (Vite) com recarga automática              |
| `pnpm test`       | Roda todos os testes (Vitest)                                               |
| `pnpm lint`       | ESLint em tudo + checagem de tipos (`tsc`) em cada pacote                   |
| `pnpm format`     | Formata com o Prettier                                                      |
| `pnpm build`      | Compila o front (`apps/web/dist`) e o backend (`apps/server/dist/index.js`) |
| `pnpm start`      | Roda o backend compilado (em produção ele também serve o front)             |
| `pnpm dev:tunel`  | Túnel rápido do Cloudflare para o `pnpm dev` (precisa do `cloudflared`)     |
| `pnpm prod:tunel` | Túnel rápido do Cloudflare para o backend compilado (porta 3001)            |

## Variáveis de ambiente

Todas ficam no `.env` da raiz (modelo em `.env.example`) e são validadas com Zod na partida.

| Variável                  | Padrão                | Descrição                                                                                     |
| ------------------------- | --------------------- | --------------------------------------------------------------------------------------------- |
| `PORT`                    | `3001`                | Porta do backend                                                                              |
| `NODE_ENV`                | `development`         | `production` liga o cookie `Secure`, exige `SESSION_SECRET` e serve o front compilado         |
| `ARGUS_MODE`              | `mock`                | `mock` (simulada) ou `real` (Fase 2)                                                          |
| `ARGUS_BASE_URL`          | —                     | URL da API da Argus (obrigatória com `real`)                                                  |
| `ARGUS_TOKEN`             | —                     | Credencial da Argus (o formato depende da documentação)                                       |
| `ARGUS_MOCK_FALHA`        | `false`               | Só no mock: começa com a Argus fora do ar                                                     |
| `POLL_MS`                 | `3000`                | Intervalo do laço de leitura da Argus (ms)                                                    |
| `DB_PATH`                 | `data/benheimdall.db` | Arquivo SQLite (relativo à raiz)                                                              |
| `SESSION_SECRET`          | aleatório em dev      | Assina o cookie de sessão. **Obrigatório em produção (32+ caracteres)**                       |
| `SESSAO_MIN`              | `15`                  | Minutos sem uso até a sessão expirar (admin e supervisor)                                     |
| `IPS_PERMITIDOS`          | IPs da Benconsig      | IPs/faixas (IPv4, IPv6, CIDR) que acessam o sistema. Vazio = sem restrição                    |
| `TV_ALLOWED_IPS`          | —                     | IPs/faixas de onde o perfil `tv` pode entrar, separados por vírgula                           |
| `ADMIN_USER`              | `admin`               | Usuário do primeiro admin (criado só na primeira execução)                                    |
| `ADMIN_SENHA_INICIAL`     | —                     | Senha inicial do primeiro admin. Se vazia, uma é gerada e aparece no log                      |
| `TRUST_PROXY`             | `loopback`            | Proxies confiáveis para achar o IP real (veja [Cloudflare](#publicação-no-cloudflare-tunnel)) |
| `DEV_ALLOWED_HOSTS`       | —                     | Só em dev: domínios extras liberados no Vite (túnel nomeado)                                  |
| `CLOUDFLARE_TUNNEL_TOKEN` | —                     | Só no Docker Compose com o perfil `cloudflare`: token do túnel                                |
| `BIND_ADDR`               | `127.0.0.1`           | Só no Docker Compose: endereço onde a porta é publicada                                       |
| `LOG_LEVEL`               | `info`                | Nível de log do pino                                                                          |

Os limites de pausa por motivo ficam em `config/pausas.json` (valores iniciais, **a confirmar com
a gestão**): Lanche 15 min, Banheiro 5, Feedback 20, Treinamento 45, Particular 10. Motivo sem
limite no arquivo usa `padraoMin`.

## Perfis e acesso

| Perfil       | Vê                                                                                                                  | Sessão                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `admin`      | Tudo, mais a tela **Usuários e acessos**                                                                            | Expira após 15 min sem uso                             |
| `supervisor` | Status de todas as equipes; código, nome e telefone do cliente **só da própria equipe** (das outras, só a campanha) | Expira após 15 min sem uso                             |
| `tv`         | Sem dados de cliente e sem motivo de pausa; entra direto no modo TV e não sai dele                                  | Não expira, mas só entra pelos IPs de `TV_ALLOWED_IPS` |

A projeção por perfil é feita **no backend**, antes de enviar, tanto em `GET /api/painel` quanto no
Socket.IO. CPF, benefício e conta **nunca** saem do backend; o telefone sai como `(11) 9****-1234`
e o cliente só pelo primeiro nome.

Regras de acesso:

- Senhas com **bcrypt**. Sessão em cookie **httpOnly**, **SameSite=Strict** e **Secure** em produção,
  validada a cada requisição. O banco guarda só o hash SHA-256 do token.
- **5 senhas erradas** bloqueiam o usuário por **5 min**.
- Conta nova e senha redefinida recebem **senha temporária** com **troca obrigatória** no primeiro acesso.
- Contas são **desativadas**, nunca apagadas. O admin não pode desativar a própria conta.
  Desativar ou redefinir a senha encerra as sessões abertas daquela conta.
- O log registra entrada, saída, expiração, tentativa recusada, bloqueio e toda alteração de conta.

## Restrição por IP

Só os endereços de `IPS_PERMITIDOS` acessam o sistema: páginas, API e tempo real (Socket.IO). Os
demais recebem `403 Acesso não permitido a partir deste endereço.`, e o primeiro acesso de cada
IP recusado vai para o log. A lista vem configurada com os IPs da operação:

```
2804:431:80f7:7700::/48, 2804:1b3:a5e7:c3c7::/48, 201.93.163.133,
2804:1b3:a5e7:2c83::/48, 201.93.159.169, 2804:1b3:a5e7:8e38::/48
```

- Aceita IPv4, IPv6 e faixas CIDR. Um valor inválido impede o sistema de subir, em vez de liberar geral.
- A própria máquina (`127.0.0.1` e `::1`) sempre entra: health checks e uso local.
- Atrás do Cloudflare ou de outro proxy, o IP conferido é o do cliente, desde que `TRUST_PROXY`
  esteja certo (próxima seção). Se `TRUST_PROXY` estiver vazio com o túnel na mesma máquina, todo
  acesso parece vir de `127.0.0.1` e entraria; o log avisa na partida.
- Em `pnpm dev` a lista vale para API e Socket.IO. A casca do front (HTML/JS, sem dados) é servida
  pelo Vite. Em produção o backend serve tudo, e a lista vale para tudo.

## Publicação no Cloudflare (Tunnel)

O BenHeimdall precisa de um processo Node rodando o tempo todo (o laço de leitura da Argus), de
SQLite e de WebSocket. Por isso ele **não roda no Cloudflare Pages nem em Workers**. O caminho é o
**Cloudflare Tunnel**: o `cloudflared`, no servidor, abre uma conexão de saída com a Cloudflare e
publica o sistema com HTTPS, **sem abrir porta** no servidor nem no firewall.

**No painel Cloudflare Zero Trust** (Networks → Tunnels):

1. Crie um túnel e copie o token.
2. Em _Public Hostname_, crie, por exemplo, `heimdall.seudominio.com.br` apontando para o serviço:
   - PM2 no servidor: `http://localhost:3001`;
   - Docker Compose: `http://benheimdall:3001`.

   WebSocket já vem habilitado no túnel.

**Opção A: servidor com PM2**

```bash
cloudflared service install <TOKEN_DO_TUNEL>
```

Com o BenHeimdall no PM2 (seção seguinte) e, no `.env`, `NODE_ENV=production` e
`TRUST_PROXY=loopback`.

**Opção B: Docker Compose**

```bash
docker compose --profile cloudflare up -d --build
```

Com `CLOUDFLARE_TUNNEL_TOKEN=<token>` e `TRUST_PROXY=loopback,uniquelocal` no `.env`. O container
do `cloudflared` também roda endurecido (somente leitura, sem capabilities). Nesse caso a porta
publicada em `BIND_ADDR` pode até ser removida do compose.

Cuidados:

- A Cloudflare repassa o IP do visitante em `X-Forwarded-For`. Com `TRUST_PROXY` apontando só para
  o `cloudflared` (loopback ou a rede do Docker), o backend usa esse IP em `IPS_PERMITIDOS`,
  `TV_ALLOWED_IPS` e no log de acessos.
- O IP da Tela TV, visto pela Cloudflare, é o **IP público da rede** de onde a TV sai. Coloque esse
  IP em `TV_ALLOWED_IPS`.
- Camada extra recomendada: uma regra de WAF na Cloudflare liberando só esses mesmos IPs (ou
  Cloudflare Access na frente). Assim o tráfego de fora nem chega ao servidor.
- As rotas `/api` respondem com `Cache-Control: no-store`; a Cloudflare não guarda dados do painel.
- O cookie `Secure` funciona porque o visitante usa HTTPS na Cloudflare.

## Produção com PM2

O arquivo `ecosystem.config.cjs` sobe o BenHeimdall no PM2, ao lado dos outros sistemas do
servidor. Ele lê o `.env` da raiz.

```bash
cp .env.example .env   # e preencha: NODE_ENV=production, SESSION_SECRET, ADMIN_SENHA_INICIAL, TV_ALLOWED_IPS, PORT livre
```

```bash
pnpm install --frozen-lockfile && pnpm build
```

```bash
pm2 start ecosystem.config.cjs --env production
```

```bash
pm2 save && pm2 startup
```

O `pm2 startup` imprime um comando para rodar como root; ele faz o PM2 voltar sozinho depois de
reiniciar o servidor.

- **Uma única instância, em modo fork.** O BenHeimdall tem um único laço de leitura da Argus e o
  Socket.IO guarda as conexões em memória. Cluster ou várias instâncias duplicariam as leituras.
- Reinício com espera crescente se o processo cair, limite de 400 MB de memória e 5 s para encerrar
  com calma (fecha o banco no `SIGINT`).
- Logs em `logs/benheimdall.out.log` e `logs/benheimdall.err.log`. Para girar os logs:
  `pm2 install pm2-logrotate`.
- Atualizar: `git pull && pnpm install --frozen-lockfile && pnpm build && pm2 reload benheimdall`.
- Se a porta 3001 já for usada por outro sistema, mude `PORT` no `.env`.

## Produção com Docker (imagem endurecida)

```bash
cp .env.example .env   # preencha SESSION_SECRET, ADMIN_SENHA_INICIAL, TV_ALLOWED_IPS...
```

```bash
docker compose up -d --build
```

O que a imagem e o compose fazem:

- **Build em múltiplos estágios.** O build roda em `node:20-bookworm`, e a execução em
  `gcr.io/distroless/nodejs20-debian12:nonroot`: **sem shell**, sem gerenciador de pacotes, sem
  ferramentas do sistema.
- **Usuário não-root** (uid 65532). Código e configuração pertencem ao root e são só leitura;
  apenas `/app/data` (volume do banco) é gravável.
- **Só o necessário entra na imagem:** bundle do backend, front compilado, dependências de produção
  e `config/pausas.json`. Ficam de fora código-fonte, testes, devDependencies e `.env`
  (veja `.dockerignore`).
- No compose:
  - `read_only: true` com `/tmp` em tmpfs `noexec,nosuid,nodev`;
  - `cap_drop: [ALL]` e `no-new-privileges`;
  - limites de memória, CPU, processos e arquivos abertos;
  - rotação de logs;
  - porta publicada só em `127.0.0.1` por padrão (use proxy reverso com HTTPS ou ajuste `BIND_ADDR`).
- `HEALTHCHECK` consulta `/api/saude`.
- **Recomendado no seu pipeline:** fixe as imagens base por digest (`FROM imagem@sha256:...`) e rode
  um scanner de vulnerabilidades (`trivy image benheimdall`).

Backup do banco: `docker run --rm -v benheimdall_dados:/d -v "$PWD":/b busybox cp /d/benheimdall.db /b/`
(com o container parado, ou copie também os arquivos `-wal`/`-shm`).

## Proxy reverso e HTTPS

Sem Cloudflare, use um proxy reverso (nginx, Caddy) com TLS. Em produção o cookie de sessão é
`Secure`: o navegador só o envia por **HTTPS**. E:

- mantenha `TRUST_PROXY=loopback` (proxy na mesma máquina) ou o IP do proxy, para o backend
  enxergar o IP real. Sem isso, `IPS_PERMITIDOS`, `TV_ALLOWED_IPS` e o log veem o IP do proxy;
- repasse o WebSocket de `/socket.io` (cabeçalhos `Upgrade` e `Connection`).

Exemplo mínimo para o nginx:

```nginx
location / {
  proxy_pass http://127.0.0.1:3001;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Como trocar `ARGUS_MODE` para `real`

1. Implementar `packages/argus-client/src/real/RealArgusClient.ts` (veja a seção seguinte).
2. No `.env`: `ARGUS_MODE=real`, `ARGUS_BASE_URL=<url da API>`, `ARGUS_TOKEN=<credencial>`.
3. Reiniciar (`pm2 reload benheimdall` ou `docker compose up -d`).
4. Conferir `GET /api/saude`. Se a Argus não responder, o painel mostra o aviso de queda e tenta de
   novo sozinho, com espera crescente até 30 s; o motivo aparece em `argus.ultimoErro`.

Hoje, com `ARGUS_MODE=real`, todos os métodos lançam `NotImplementedError`. O painel sobe, mas fica
com o aviso "Sem conexão com a Argus".

## O que falta para a Fase 2

Nada disso foi inventado. Ficou marcado com `TODO(Fase 2)` ou deixado configurável:

- [ ] **Endpoints, autenticação e paginação** da API da Argus: cada método de `RealArgusClient`.
- [ ] **Nomes reais de status** da Argus: preencher `RealArgusClient.mapaStatus`. Hoje, status
      desconhecido vira OFFLINE e gera aviso no log.
- [ ] **Código do cliente**: confirmar se a chamada ativa traz o código ou se é preciso cruzar pelo
      telefone (hoje, sem código, aparece "—").
- [ ] **Formato das respostas**: converter para os schemas de `packages/argus-client/src/tipos.ts`
      (ou ajustar esses schemas, que são provisórios).
- [ ] **Limites finais de pausa por motivo** (`config/pausas.json`), a confirmar com a gestão. Os nomes
      precisam bater com as descrições de motivo da Argus.
- [ ] **PC e IP da Tela TV** (`TV_ALLOWED_IPS`).
- [ ] **Compartilhar o `ArgusClient` com o BenUra?** O cliente já está isolado em
      `packages/argus-client`, sem dependência do resto do BenHeimdall.

## Arquitetura

```
BenHeimdall/
├─ apps/
│  ├─ server/              # Node + Express + Socket.IO + SQLite
│  │  ├─ src/leitura/      # laço único de leitura, normalizador, mascaramento, status_eventos
│  │  ├─ src/acesso/       # login, sessão, bloqueio, troca de senha, IP da TV, log
│  │  ├─ src/rotas/        # /api/sessao, /api/painel, /api/agentes, /api/usuarios, /api/dev
│  │  ├─ src/projecao.ts   # o que cada perfil pode ver
│  │  ├─ src/socket.ts     # painel:atualizado a cada ciclo, já projetado
│  │  └─ test/             # Vitest
│  └─ web/                 # React 18 + Vite + Tailwind + TanStack Query + React Router
├─ packages/
│  ├─ shared/              # tipos (Agente, Painel...), schemas Zod e regras de exibição
│  └─ argus-client/        # interface ArgusClient, MockArgusClient e RealArgusClient (esqueleto)
├─ config/pausas.json      # limites de pausa por motivo
├─ docs/prototipo-benheimdall.html   # protótipo visual aprovado
├─ ecosystem.config.cjs    # PM2
├─ Dockerfile · docker-compose.yml
└─ .env.example
```

Fluxo de dados:

1. **Um único** laço consulta a Argus a cada `POLL_MS`, não importa quantos navegadores estejam abertos.
2. As respostas são validadas com Zod, normalizadas para `Painel` e mascaradas. Cada mudança de
   status vai para `status_eventos`, de onde saem o total de pausa do dia e a linha do tempo. Por
   isso esses dados sobrevivem a reinícios.
3. O Socket.IO envia `painel:atualizado` a cada ciclo, já projetado pelo perfil de cada sessão. A
   fotografia inicial vem de `GET /api/painel`.
4. No navegador, os cronômetros correm a cada segundo, corrigidos pela diferença entre o relógio
   local e `atualizadoEm` (hora do servidor).

API:

| Rota                                                                                                       | Acesso                                      | Descrição                                 |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------- |
| `GET /api/saude`                                                                                           | público                                     | Conexão com a Argus e com o banco         |
| `POST /api/sessao/entrar`                                                                                  | público                                     | Login                                     |
| `GET /api/sessao` · `POST /api/sessao/renovar` · `POST /api/sessao/sair` · `POST /api/sessao/trocar-senha` | sessão                                      | Sessão atual                              |
| `GET /api/painel`                                                                                          | sessão                                      | Fotografia atual, já filtrada pelo perfil |
| `GET /api/agentes/:id`                                                                                     | admin, supervisor                           | Linha do tempo e pausa do dia             |
| `GET/POST /api/usuarios`, `POST /api/usuarios/:id/(desativar\|reativar\|nova-senha)`, `GET /api/acessos`   | admin                                       | Administração de contas e log             |
| `POST /api/dev/argus/(queda\|restaurar)`                                                                   | admin, supervisor; só mock fora de produção | Simular queda da Argus                    |

## Decisões tomadas

Escolhas feitas onde o enunciado não definia, ou definia de outro jeito, sempre pela opção mais
simples:

**Visual**

1. **Tipografia trocada a pedido:** o enunciado e o protótipo usam Barlow, Barlow Condensed e
   JetBrains Mono. A pedido, passou a ser **Space Grotesk** (títulos e números), **Inter** (texto) e
   JetBrains Mono só em código e telefone do cliente. O layout do protótipo foi mantido, com mais
   movimento: entrada animada das linhas, pulso nas pausas acima do limite, números que "saltam" ao
   mudar, ponto ao vivo e barras animadas. Tudo isso desliga com `prefers-reduced-motion`.
2. **Tema** segue o sistema (escuro ou claro), com as cores da marca nos dois.
3. Fontes servidas pelo próprio app (`@fontsource-variable`), para a TV funcionar sem internet.

**Dados e painel**

4. No tipo `Agente`, os campos de cliente de `atendimento` e o `pausa.motivo` são **opcionais**: é
   assim que a projeção por perfil os omite.
5. Status desconhecido da Argus vira **OFFLINE** e gera aviso no log (uma vez por código).
6. Motivo de pausa sem limite em `config/pausas.json` usa `padraoMin` (15 min).
7. Os indicadores de status contam **os agentes do filtro atual**. **Fila de espera e callbacks
   saíram da tela** a pedido: não são necessários para os supervisores. O backend continua lendo e
   enviando esses números no `Painel`, para voltarem fácil se for preciso.
8. O "dia" do total de pausa começa à **meia-noite no fuso do servidor**. Configure
   `TZ=America/Sao_Paulo` se o servidor estiver em UTC.
9. O histórico começa quando o BenHeimdall começa a ler: não há carga retroativa do dia.
10. Pós-atendimento mantém a campanha da chamada ("Tabulando") e nunca entra em "livres".
11. Os códigos de status do mock são inventados de propósito e ficam isolados no `argus-client`.
12. A ordem dos livres (mais ocioso ou melhor conversão) fica salva no navegador (`localStorage`).
13. O mapa do salão mostra o salão inteiro; quem está fora do filtro fica esmaecido.

**Acesso**

14. "Uso" da sessão é **interação do usuário** (clique, tecla, mouse, rolagem), com no máximo uma
    renovação a cada 30 s. Leituras automáticas (Socket.IO, fotografia) **não renovam**. O socket
    confere a sessão a cada ciclo e desconecta quem expirou ou foi desativado. Uma varredura a cada
    minuto registra no log as sessões que expiraram com o navegador fechado.
15. Senha errada mostra mensagem genérica ("Usuário ou senha incorretos"), sem revelar se o usuário
    existe. A conferência gasta o mesmo tempo nos dois casos.
16. O bloqueio conta erros por conta existente. Uma conta desativada só é avisada como "desativada"
    se a senha estiver certa.
17. O IP da TV é conferido no login e a cada requisição. **Em desenvolvimento**, o proxy do Vite faz
    tudo chegar de `127.0.0.1`.
18. A senha temporária tem 10 caracteres, sem caracteres ambíguos, e é mostrada **uma única vez** ao
    admin. Nova senha também encerra as sessões e zera o bloqueio da conta.
19. Senha nova: mínimo de 8 caracteres e diferente da atual.
20. `GET /api/saude` é público (útil para monitoramento) e não expõe dados de agentes.

**Modo TV**

21. No modo TV a vista é sempre o painel (abas e filtros escondidos). A tela cheia é pedida ao ligar
    o modo pelo botão. No perfil `tv`, que entra direto, use o navegador da TV em modo quiosque
    (ex.: `chromium --kiosk`), porque o navegador não permite tela cheia sem um clique.

**Execução**

22. Em produção, o backend serve o front compilado (mesma origem do cookie). Em desenvolvimento, o
    Vite faz proxy.
23. O backend de produção é um bundle do esbuild (`apps/server/dist/index.js`). Toda dependência npm
    dos pacotes do workspace também fica declarada no `package.json` do servidor, para existir uma
    única cópia em produção.
24. A simulação de queda (`/api/dev`) só existe no modo mock **fora de produção**.

**Rede e Cloudflare**

25. Publicação pelo **Cloudflare Tunnel**, não por Pages/Workers, que não rodam um processo
    contínuo com SQLite e WebSocket.
26. `TRUST_PROXY=loopback` por padrão: confia só em proxies na própria máquina (Vite em dev,
    `cloudflared` ou nginx locais). Quem conecta direto de fora não consegue forjar o IP pelo
    `X-Forwarded-For`.
27. `IPS_PERMITIDOS` vale para todo o sistema e sempre aceita a própria máquina. O Socket.IO, que
    não passa pelos middlewares do Express, confere a lista e o IP da TV pelo mesmo IP real.
28. O `.env` é lido pelo próprio backend, sem sobrescrever variáveis já definidas no sistema, no PM2
    ou no Docker. Assim funciona em qualquer Node 20+ e em qualquer sistema operacional.
