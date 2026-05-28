# Docker Run

mt2でsudoなしに起動する場合の最小コマンドです。

```bash
cd /home/sato/ox-ai-workshop-builder
docker build -t ox-ai-workshop-builder:latest .
docker rm -f ox-ai-workshop-builder 2>/dev/null || true
docker run -d \
  --name ox-ai-workshop-builder \
  --restart unless-stopped \
  -p 3400:3400 \
  -v /home/sato/ox-ai-workshop-builder/data:/app/data \
  -e OX_LOGIN_ID=oyo \
  -e OX_LOGIN_PASS=oxai \
  -e OX_CODEX_ENABLED=0 \
  ox-ai-workshop-builder:latest
```

通常のワークショップではこのまま有料APIなしで使います。初回作成と改良は、アプリ内の軽量テンプレート生成で即時に動きます。

Codex CLI連携を明示的に使う場合だけ、以下のようにイメージを作ります。APIキーは渡さず、ChatGPT ProでログインしたCodex CLIの認証ディレクトリをマウントします。

```bash
mkdir -p /home/sato/.codex
docker build --build-arg INSTALL_CODEX=1 -t ox-ai-workshop-builder:codex .

docker run --rm -it \
  -v /home/sato/.codex:/root/.codex \
  ox-ai-workshop-builder:codex \
  codex login --device-auth

docker rm -f ox-ai-workshop-builder
docker run -d \
  --name ox-ai-workshop-builder \
  --restart unless-stopped \
  -p 3400:3400 \
  -v /home/sato/ox-ai-workshop-builder/data:/app/data \
  -v /home/sato/.codex:/root/.codex \
  -e OX_LOGIN_ID=oyo \
  -e OX_LOGIN_PASS=oxai \
  -e OX_CODEX_ENABLED=1 \
  -e OX_CODEX_ON_CREATE=1 \
  -e OX_CODEX_ON_IMPROVE=1 \
  ox-ai-workshop-builder:codex
```

この設定では、初回作成と作成後の改良タブからの指示を `codex exec` に渡します。Codex CLIが利用できない場合は、ローカル生成のデモアプリを表示します。
