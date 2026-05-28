# OX AI Workshop Builder

応用地質の支社向けAIワークショップで使う、AI開発体験アプリのMVPです。

## 機能

- `oyo` / `oxai` でログイン
- 特化型AI開発と生成AI活用を選択
- 特化型AIは斜面監視、河川監視、構造物点検、計測データ異常検知の4類型を選択
- 生成AI活用はファイル、入力、処理、出力を自由に指定
- アップロードファイルと指示文から静的プロトタイプを生成
- 作成後に「画面」「プロンプト」「出力」「データ」のタブで改良指示を入力し、同じデモアプリを更新
- 通常運用は有料APIなしのローカル生成モード
- 必要な場合だけ `INSTALL_CODEX=1` と `OX_CODEX_ENABLED=1` で Codex CLI 連携を有効化
- Codex CLI連携はAPIキーではなく、ChatGPT ProでログインしたCLI認証を利用可能
- 生成済みアプリを `/archive/:id/` に公開

## ローカル実行

```bash
npm start
```

ブラウザで `http://localhost:3400` を開きます。

## 環境変数

| 変数 | 既定値 | 内容 |
| --- | --- | --- |
| `PORT` | `3400` | Webアプリの待受ポート |
| `HOST` | `0.0.0.0` | 待受ホスト |
| `OX_LOGIN_ID` | `oyo` | ログインID |
| `OX_LOGIN_PASS` | `oxai` | ログインパスワード |
| `OX_CODEX_ENABLED` | `0` | 通常は `0`。`1` の場合だけ `codex exec` を実行 |
| `OX_CODEX_ON_CREATE` | `0` | `1` の場合、初回作成からCodex CLIを使う |
| `OX_CODEX_ON_IMPROVE` | `1` | `1` の場合、改良指示でCodex CLIを使う |
| `OX_CODEX_MODEL` | 空 | 指定した場合だけ `codex exec -m` に渡す |
| `OX_CODEX_TIMEOUT_MS` | `180000` | Codex実行タイムアウト |
| `OX_MAX_UPLOAD_BYTES` | `31457280` | リクエスト最大サイズ |

## mt2 公開の概要

1. mt2 に Docker と cloudflared を用意する。
2. このリポジトリを `/opt/ox-ai-workshop-builder` に配置する。
3. Dockerで `OX_CODEX_ENABLED=0` のローカル生成モードとして起動する。
4. Cloudflare Tunnelで `https://demo.ox-ai-app.com` をアプリコンテナに向ける。

詳細は [deploy/mt2-setup.md](deploy/mt2-setup.md) を参照してください。

Codex CLIをChatGPT Pro枠で使う場合は [deploy/codex-cli-pro.md](deploy/codex-cli-pro.md) を参照してください。

mt2でDocker整理を毎回sudo認証なしにする場合は、mt2上で一度だけ以下を実行します。

```bash
sudo /home/sato/ox-ai-workshop-builder/deploy/install-mt2-nopasswd.sh
```

以後は `sudo -n /usr/local/sbin/ox-ai-workshop-reset` で固定名2コンテナ構成に戻せます。
スクリプト自体の更新も、以後は `sudo -n /usr/local/sbin/ox-ai-workshop-install` で反映できます。
