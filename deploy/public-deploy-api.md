# Public deploy API

GitHubへpushしたあと、公開URLへデプロイ要求を送る。

```bash
curl -X POST https://demo.ox-ai-app.com/api/deploy \
  -H "Authorization: Bearer $OX_DEPLOY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ref":"main"}'
```

または:

```bash
OX_DEPLOY_TOKEN=... ./deploy/trigger-public-deploy.sh main
```

状態確認:

```bash
curl https://demo.ox-ai-app.com/api/deploy/status \
  -H "Authorization: Bearer $OX_DEPLOY_TOKEN"
```

トークンは mt2 の `/home/sato/ox-ai-workshop-builder/.deploy.env` に置く。
公開アプリはデプロイ依頼だけを作成し、pull / rebuild / restart は mt2 の `ox-ai-workshop-deploy.timer` が実行する。
