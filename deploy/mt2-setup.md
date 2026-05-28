# mt2 / Cloudflare Tunnel セットアップ手順

この手順は、mt2 のUbuntuサーバーに OX AI Workshop Builder を配置し、`https://demo.ox-ai-app.com` で公開するためのものです。

## 1. Ubuntuへログイン

```bash
ssh <user>@mt2
```

## 2. 基本パッケージ

```bash
sudo apt update
sudo apt install -y curl git ca-certificates build-essential
```

## 3. Node.js LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

## 4. 生成モード

通常運用は有料APIなしです。Codex CLIをChatGPT Proでログインして使う場合、OpenAI APIキーは不要です。

`/usr/local/sbin/ox-ai-workshop-reset` は `INSTALL_CODEX=1` でDockerイメージを作り、`/home/sato/.codex` をコンテナにマウントします。Codex CLIが利用できる場合は初回作成と改良の両方で `codex exec` を実行し、使えない場合はローカル生成にフォールバックします。手順は [codex-cli-pro.md](codex-cli-pro.md) を参照してください。

## 5. sudo認証を省く場合

Dockerの起動状態を固定名2コンテナに戻す専用スクリプトだけ、パスワードなしで実行できるようにします。

```bash
sudo /home/sato/ox-ai-workshop-builder/deploy/install-mt2-nopasswd.sh
```

以後は次のコマンドで再ビルド、旧コンテナ整理、Cloudflare Tunnel起動までまとめて実行できます。

```bash
sudo -n /usr/local/sbin/ox-ai-workshop-reset
```

## 6. アプリ配置

```bash
sudo mkdir -p /opt/ox-ai-workshop-builder
sudo chown -R "$USER":"$USER" /opt/ox-ai-workshop-builder
cd /opt/ox-ai-workshop-builder
```

このディレクトリに本アプリのファイルを配置します。

## 7. systemd

`/etc/systemd/system/ox-ai-workshop-builder.service` を作成します。

```ini
[Unit]
Description=OX AI Workshop Builder
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/ox-ai-workshop-builder
Environment=PORT=3400
Environment=HOST=127.0.0.1
Environment=OX_LOGIN_ID=oyo
Environment=OX_LOGIN_PASS=oxai
Environment=OX_CODEX_ENABLED=1
Environment=OX_CODEX_ON_CREATE=1
Environment=OX_CODEX_ON_IMPROVE=1
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
User=oxbuilder
Group=oxbuilder

[Install]
WantedBy=multi-user.target
```

ユーザーを作成して起動します。

```bash
sudo adduser --disabled-password --gecos "" oxbuilder
sudo chown -R oxbuilder:oxbuilder /opt/ox-ai-workshop-builder
sudo systemctl daemon-reload
sudo systemctl enable --now ox-ai-workshop-builder
sudo systemctl status ox-ai-workshop-builder
```

## 8. Cloudflare Tunnel

cloudflared を導入します。

```bash
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
cloudflared --version
```

Cloudflareにログインします。

```bash
cloudflared tunnel login
```

トンネルを作成します。

```bash
cloudflared tunnel create ox-ai-app-demo
```

`/etc/cloudflared/config.yml` を作成します。

```yaml
tunnel: ox-ai-app-demo
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: demo.ox-ai-app.com
    service: http://localhost:3400
  - service: http_status:404
```

DNSルートを設定します。

```bash
cloudflared tunnel route dns ox-ai-app-demo demo.ox-ai-app.com
```

サービスとして起動します。

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared
```

## 8. 確認

```bash
curl -I http://localhost:3400
curl -I https://demo.ox-ai-app.com
```

ブラウザで `https://demo.ox-ai-app.com` を開き、`oyo` / `oxai` でログインします。
