# Codex CLI Pro Mode

APIキー課金を使わず、ChatGPT ProでログインしたCodex CLIを初回作成と改良の両方で呼び出す構成です。

## 使い方

```bash
cd /home/sato/ox-ai-workshop-builder

mkdir -p /home/sato/.codex
docker build --build-arg INSTALL_CODEX=1 -t ox-ai-workshop-builder:codex .

docker run --rm -it \
  -v /home/sato/.codex:/root/.codex \
  ox-ai-workshop-builder:codex \
  codex login --device-auth
```

画面に出る案内に従い、ChatGPT Proアカウントでログインします。完了後、同じ認証ディレクトリを本体コンテナにマウントします。

```bash
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

## 動作

- 初回作成: ローカル生成で下地を作り、Codex CLIでWebアプリとして整える
- 改良指示: 作成後の「画面」「プロンプト」「出力」「データ」タブからCodex CLIを実行
- 失敗時: Codex CLIが使えない場合も、ローカル生成のアプリをそのまま表示

## 確認

```bash
docker exec -it ox-ai-workshop-builder codex login status
docker logs -f ox-ai-workshop-builder
```

`codex login --device-auth` が使えないバージョンでは、同じマウント指定で `codex login` を実行してください。
