# syntax=docker/dockerfile:1.7
# Imagem endurecida do BenHeimdall.
#  - Build em node:20 (imagem completa); execução em distroless (sem shell, sem gerenciador de pacotes,
#    sem ferramentas do sistema) como usuário não-root (uid 65532).
#  - Só entra o necessário para rodar: bundle do backend, front compilado, dependências de
#    produção do servidor (npm ci --omit=dev) e config/pausas.json. Nada de código-fonte,
#    testes, devDependencies ou .env.
#  - Em produção, fixe as imagens base por digest (FROM imagem@sha256:...) e rode um scanner
#    (ex.: trivy image benheimdall) no pipeline.

# Build na imagem completa (já traz python3, make e g++ para módulos nativos, sem apt-get).
ARG NODE_IMAGE=node:20-bookworm
ARG RUNTIME_IMAGE=gcr.io/distroless/nodejs20-debian12:nonroot

# ---------- dependências de produção (só as do servidor) ----------
FROM ${NODE_IMAGE} AS deps
ENV CI=true \
    # Se não houver binário pré-compilado de better-sqlite3/bcrypt, compila com os headers
    # do próprio Node da imagem (sem baixar nada).
    npm_config_nodedir=/usr/local
WORKDIR /src
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/argus-client/package.json packages/argus-client/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --workspace @benheimdall/server --include-workspace-root=false \
 # Os pacotes do workspace já vão dentro do bundle: os atalhos para eles não entram na imagem.
 && rm -rf node_modules/@benheimdall node_modules/.bin \
 && chmod -R a=rX,u+w node_modules

# ---------- build (front + bundle do backend) ----------
FROM ${NODE_IMAGE} AS build
ENV CI=true \
    npm_config_nodedir=/usr/local
WORKDIR /src
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/argus-client/package.json packages/argus-client/
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN npm run build \
 && mkdir -p /out/apps/server /out/apps/web /out/data \
 && cp -r apps/server/dist /out/apps/server/dist \
 && cp -r apps/web/dist /out/apps/web/dist \
 && cp -r config /out/config \
 # Código e config: dono root, só leitura/travessia para o processo. data/: só do usuário do app.
 && chmod -R a=rX,u+w /out/apps /out/config \
 && chown 65532:65532 /out/data && chmod 0700 /out/data

# ---------- execução ----------
FROM ${RUNTIME_IMAGE}
LABEL org.opencontainers.image.title="BenHeimdall" \
      org.opencontainers.image.description="Painel de monitoramento em tempo real do call center da Benconsig"
ENV NODE_ENV=production \
    PORT=3020 \
    DB_PATH=data/benheimdall.db
WORKDIR /app
# Arquivos do app pertencem ao root e são só leitura para o processo; só data/ é gravável.
COPY --from=deps --chown=0:0 /src/node_modules /app/node_modules
COPY --from=build --chown=0:0 /out/apps /app/apps
COPY --from=build --chown=0:0 /out/config /app/config
COPY --from=build --chown=65532:65532 /out/data /app/data
USER 65532:65532
EXPOSE 3020
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3020)+'/api/saude').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"]
ENTRYPOINT ["/nodejs/bin/node", "--enable-source-maps", "apps/server/dist/index.js"]
