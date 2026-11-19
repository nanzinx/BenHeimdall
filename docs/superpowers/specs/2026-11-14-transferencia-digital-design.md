# Transferência para a Digital sem depender do supervisor

## Por quê

O operador da discadora está com o cliente na linha e precisa transferir para alguém da **equipe
Digital** (é ela que converte). Hoje só o supervisor enxerga quem da Digital está livre, então o
operador tem que perguntar a ele: o supervisor vira gargalo e o cliente espera.

Sucesso: o operador sabe, em segundos e sem perguntar a ninguém, para quem transferir; duas
transferências não caem na mesma pessoa; a distribuição entre o pessoal da Digital fica justa.

## Objetivos

- **Botão "Preciso transferir"** numa página do operador. O sistema escolhe o próximo livre da
  Digital (o mais ocioso que não esteja reservado), **reserva por 60 s** e diz ao operador
  "Transfira para Fulano · ramal X".
- Cada operador entra com **login por e-mail**, como os supervisores.
- O **operador da Digital** avisa no site que pode receber transferência ("Estou livre") e é
  **avisado no site** (som + notificação do navegador) quando uma transferência vem para ele.
- Tudo registrado: quem pediu, para quem foi, se a transferência chegou.

## Fora do escopo (agora)

- **A lista "Livres da Digital agora" para o operador** (decidido: só o botão; o operador não
  escolhe para quem transferir, o sistema escolhe). O supervisor continua vendo os livres no painel.
- Consulta para o BenHub (fica para quando houver a integração).
- Transferir sozinho pela Argus: a API não transfere para um ramal (só abre o pop-up na tela do
  operador). Quem transfere continua sendo o operador, no softphone.
- Relatório de transferências por pessoa. O registro fica gravado; a tela vem depois.
- Mexer no status da Argus (pausar, liberar).

## Anti-objetivos

- Não pode virar mais uma coisa que o operador precisa "cuidar": a página fica aberta numa aba o
  dia todo, sem cair a cada 15 min.
- O operador não vê dado de cliente nem o painel: só a página dele.
- Não pode mandar duas transferências para a mesma pessoa ao mesmo tempo.

## Restrições

- Mesmo servidor e mesmo ciclo de leitura de hoje (Argus a cada 3 s). Nada novo na Argus.
- Fora da rede da empresa ninguém entra (`IPS_PERMITIDOS`, como o resto).
- "Livre" é o status LIVRE da Argus; WhatsApp/Digital (`LIGAÇÃO - WPP`, `Em Atendimento - DIGITAL`)
  já contam como atendimento, então não aparecem como livres.

## Caminhos considerados

1. **Página com a lista de livres:** rápida, tira o supervisor do meio, mas deixa colisão e
   distribuição injusta, e o operador escolhe quem quiser.
2. **O sistema escolhe e reserva (botão):** resolve colisão e justiça; precisa saber quem é o
   operador.
3. **O operador pede e o supervisor responde:** mantém o gargalo. Descartado.

**Escolhido: só o 2 (o botão)**, com login por e-mail para cada operador.

## Como fica

### Perfil novo: operador

- Conta com e-mail, senha, nome e **ramal** (o ramal liga a conta ao agente da Argus).
- Depois do login vai direto para `/transferir`. Não abre o painel, os usuários nem o detalhe do
  agente; a API dele é só a da transferência.
- **Sessão do dia:** não cai por 15 min sem uso (o operador fica numa aba aberta); dura até o fim
  do dia de trabalho (meia-noite) ou até sair. Senhas, bloqueio após 5 erros, troca no primeiro
  acesso e log de acessos: iguais aos das outras contas.

### Criar ~50 contas

- Em **Usuários e acessos**, o admin cria a conta de operador como as outras (perfil "operador" +
  ramal).
- Botão **"Importar operadores da Argus"**: lê os operadores da Argus (nome, ramal e e-mail, que a
  `/listarusuarios` já devolve), mostra a lista e cria de uma vez as contas que ainda não existem,
  com senha temporária. Ao fim mostra **e-mail + senha temporária de cada um** para o admin
  repassar (pode imprimir). Quem não tem e-mail na Argus fica de fora, avisado.

### Página do operador (`/transferir`)

Pensada para ficar aberta numa aba (e caber no celular).

```
┌──────────────────────────────────────┐
│ BenHeimdall · Transferência   Ana Paula · Sair │
│                                        │
│        [  Preciso transferir  ]        │
│                                        │
│   Digital: 4 livres agora              │
└──────────────────────────────────────┘
```

Depois do clique:

```
  Transfira para  IGOR VALENTE · ramal 2148
  reservado para você por 0:58
  [ Transferi ]   [ Não consegui, outro ]
```

- **Pedir:** o servidor escolhe o livre da Digital há mais tempo, que não esteja reservado, e
  reserva por 60 s. Um operador só tem uma reserva por vez (pedir de novo devolve a mesma).
- **Ninguém livre:** "Ninguém da Digital livre agora. Assim que alguém liberar, aparece aqui." A
  página tenta de novo sozinha e mostra o primeiro que liberar (já reservado para ele).
- **Fim da reserva:**
  - _chegou:_ o reservado sai de LIVRE para ATENDENDO dentro dos 60 s → "concluída";
  - _"Transferi":_ concluída na hora;
  - _"Não consegui, outro":_ cancela e já pede o próximo (sem repetir o mesmo);
  - _60 s sem nada:_ expira e a pessoa volta para a fila.
- Só mostra **quantos** da Digital estão livres, não quem (decisão: o operador não escolhe).
- Atualiza a cada 3 s.

### Página do operador da Digital (`/transferir`, conta da equipe Digital)

```
┌──────────────────────────────────────┐
│ BenHeimdall · Digital        Igor · Sair │
│   Você está: ● LIVRE p/ transferência   │
│   [ Estou livre ]  [ Ocupado ]          │
│  🔔 Bruno vai te transferir um cliente  │
│     agora (ramal 2105)                  │
└──────────────────────────────────────┘
```

- **Quem recebe transferência:** só quem está **LIVRE na Argus E marcou "Estou livre"** no site
  (decidido: o botão não mexe na Argus; a Argus segue sendo a fonte da verdade e o clique é o
  "pode mandar" do operador).
- A marca vale até ele clicar "Ocupado", sair, a sessão acabar ou ele ficar OFFLINE na Argus.
  Pausa e ligação não apagam a marca: quando volta a LIVRE na Argus, já volta para a fila.
- Marcou "Estou livre" mas está em pausa/ligação na Argus: a página mostra "Você marcou livre,
  mas a Argus mostra Em pausa · Almoço" e ele não entra na fila.
- **Aviso:** ao ser reservado, a página toca um som, mostra "Bruno vai te transferir um cliente
  (ramal 2105)" e manda notificação do navegador (funciona com a aba minimizada; pede permissão
  na primeira vez).
- Na fila, a ordem continua por quem está livre há mais tempo na Argus.

### Painel do supervisor

Na coluna "Livres p/ transferência", quem está reservado ganha a etiqueta
"reservado p/ Bruno · 0:42", e quem está livre na Argus mas não marcou "Estou livre" aparece
apagado, com "não marcou livre". A ordem não muda.

### Servidor

- `GET /api/transferencia` (perfil operador) → reserva atual do operador, se houver, e quantos da
  Digital estão livres.
- `POST /api/transferencia` → cria a reserva (ou devolve a que já existe).
- `POST /api/transferencia/:id/transferi` e `/:id/outro` → fecham a reserva.
- `POST /api/transferencia/disponivel` `{ livre: true|false }` (operador da Digital) → marca/desmarca.
  `GET /api/transferencia` devolve para ele a marca, o status da Argus e a reserva recebida.
- Reservas em memória (o servidor é um processo só) + tabela `transferencias` no SQLite com o
  histórico: pedida_em, operador (conta e ramal), destino (nome e ramal), como terminou
  (concluída, cancelada, expirada) e quando. A reserva aberta no painel vem do mesmo lugar.
- O ciclo de leitura fecha as reservas: a cada leitura, confere quem saiu de LIVRE e quem expirou.
- Usuário ganha a coluna `ramal` e o perfil `operador` (migração no SQLite).

## Decisões que tomei (pode mudar)

- Reserva de **60 s**; ordem por **mais ocioso** (a conversão ainda não é real).
- Sessão do operador dura o dia (até meia-noite), sem expirar por inatividade.
- Importação das contas pela Argus, com a lista de senhas temporárias para o admin repassar.
- A página mostra só a quantidade de livres da Digital.
- A marca "Estou livre" dura até "Ocupado", sair, fim da sessão ou OFFLINE na Argus.
- "Transferi" e "chegou" contam igual como concluída.

## Para quem for construir

- Reaproveitar `listarLivres` / `recebeTransferencia` (`packages/shared/src/regras.ts`) e o
  `ServicoAcesso` (contas, sessões, log).
- O roteador novo fica antes de `rotasUsuarios` em `app.ts` (aquele roteador exige admin em tudo).
- O perfil operador não pode receber `painel:atualizado` no Socket.IO nem acessar `/api/painel`.
- Testes: escolha do próximo (mais ocioso, sem reservado), uma reserva por operador, expiração,
  conclusão pelo status, colisão (dois pedidos ao mesmo tempo vão para pessoas diferentes),
  operador barrado no painel e na administração, sessão do operador sem expirar em 15 min,
  importação (cria só quem não existe, pula quem não tem e-mail), só entra na fila quem está
  LIVRE na Argus e marcou "Estou livre", a marca some ao ficar OFFLINE.
