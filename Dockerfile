FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

ARG INSTALL_CODEX=0
RUN if [ "$INSTALL_CODEX" = "1" ]; then npm install -g @openai/codex@latest; fi

WORKDIR /app

COPY package.json server.js README.md ./
COPY public ./public
COPY deploy ./deploy

ENV HOST=0.0.0.0
ENV PORT=3400

EXPOSE 3400

CMD ["node", "server.js"]
