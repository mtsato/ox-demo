const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");

const PORT = Number(process.env.PORT || 3400);
const HOST = process.env.HOST || "0.0.0.0";
const APP_ROOT = __dirname;
const DATA_DIR = path.join(APP_ROOT, "data");
const PROJECTS_DIR = path.join(DATA_DIR, "projects");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const GENERATED_DIR = path.join(DATA_DIR, "generated");
const CODEX_RUNS_DIR = path.join(DATA_DIR, "codex-runs");
const CODEX_REQUESTS_DIR = path.join(DATA_DIR, "codex-requests");
const CODEX_RESULTS_DIR = path.join(DATA_DIR, "codex-results");
const CODEX_LOGS_DIR = path.join(DATA_DIR, "codex-logs");
const PUBLIC_DIR = path.join(APP_ROOT, "public");
const MAX_BODY_BYTES = Number(process.env.OX_MAX_UPLOAD_BYTES || 30 * 1024 * 1024);
const AUTH_ID = process.env.OX_LOGIN_ID || "oyo";
const AUTH_PASS = process.env.OX_LOGIN_PASS || "oxai";
const CODEX_ENABLED = process.env.OX_CODEX_ENABLED !== "0";
const CODEX_EXTERNAL = process.env.OX_CODEX_EXTERNAL === "1";
const CODEX_ON_CREATE = process.env.OX_CODEX_ON_CREATE !== "0";
const CODEX_ON_IMPROVE = process.env.OX_CODEX_ON_IMPROVE !== "0";
const CODEX_MODEL = process.env.OX_CODEX_MODEL || "";
const CODEX_TIMEOUT_MS = Number(process.env.OX_CODEX_TIMEOUT_MS || 180000);
const DEPLOY_TOKEN = process.env.OX_DEPLOY_TOKEN || "";
const DEPLOY_REQUESTS_DIR = path.join(DATA_DIR, "deploy-requests");
const DEPLOY_STATUS_FILE = path.join(DATA_DIR, "deploy-status.json");

const sessions = new Map();
const jobs = new Map();

const specializedTemplates = [
  {
    id: "slope-monitoring",
    title: "地すべり監視AI",
    tag: "画像 + 時系列",
    description: "監視カメラ画像、雨量、変位データから地すべり領域と警戒レベルを可視化します。",
    features: ["地すべり領域を1ラベルで検知", "雨量・変位の時系列を同時確認", "警戒レベルと点検依頼文を生成"],
    sample: "山腹斜面の監視カメラ画像、24時間雨量、伸縮計の変位データ",
    inputs: ["監視カメラ画像", "雨量CSV", "変位CSV", "現場メモ"],
    flow: ["地すべり領域の正解確認", "セグメンテーション学習", "雨量・変位の時系列評価", "警戒レベル判定", "点検依頼文生成"],
    outputs: ["監視ダッシュボード", "地すべりマスク", "警戒コメント", "点検依頼文"]
  },
  {
    id: "river-monitoring",
    title: "道路冠水・水位AI",
    tag: "カメラ + 水位",
    description: "道路カメラと水位・雨量データを組み合わせ、冠水域と通行判断を表示します。",
    features: ["冠水域を1ラベルで検知", "水位・雨量グラフで急変を確認", "通行注意の通知文を生成"],
    sample: "アンダーパス監視カメラ画像、水位CSV、雨量CSV、平常時画像",
    inputs: ["道路監視カメラ画像", "水位CSV", "雨量CSV", "平常時画像"],
    flow: ["冠水域の正解確認", "冠水セグメンテーション学習", "水位トレンド表示", "通行注意判定", "通知文生成"],
    outputs: ["冠水監視画面", "水位グラフ", "通行注意コメント", "通知文"]
  },
  {
    id: "inspection-damage",
    title: "ひび割れ検知AI",
    tag: "点検画像",
    description: "近接点検写真から細いひび割れだけを検知し、位置図と点検コメントにつなげます。",
    features: ["ひび割れを1ラベルで検知", "検知位置を写真と位置図で確認", "写真台帳コメントを生成"],
    inputs: ["近接点検写真", "点検メモ", "位置図"],
    sample: "橋梁・擁壁・トンネル覆工の近接写真と点検メモ",
    flow: ["ひび割れの正解確認", "ひび割れセグメンテーション学習", "検知位置の整理", "点検記録化", "報告書コメント生成"],
    outputs: ["ひび割れ検知画面", "位置図", "写真台帳コメント", "報告書下書き"]
  },
  {
    id: "timeseries-anomaly",
    title: "地すべり計測予測AI",
    tag: "CSV + 予測",
    description: "雨量、地下水位、変位速度の時系列CSVから現在の警戒判定と24時間予測を表示します。",
    features: ["正常・注意・警戒の教師データを確認", "現在値から警戒判定と予測レンジを表示", "閾値超過時のアラート文を生成"],
    sample: "雨量、地下水位、伸縮計変位速度の時系列CSV",
    inputs: ["雨量CSV", "地下水位CSV", "変位CSV", "判定履歴"],
    flow: ["計測地点の確認", "教師データ確認", "警戒判定モデルの学習", "24時間予測線の作成", "アラート文生成"],
    outputs: ["時系列ダッシュボード", "警戒判定", "予測レンジ", "アラート文"]
  }
];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8"
};

async function ensureDirs() {
  await fsp.mkdir(PROJECTS_DIR, { recursive: true });
  await fsp.mkdir(UPLOADS_DIR, { recursive: true });
  await fsp.mkdir(GENERATED_DIR, { recursive: true });
  await fsp.mkdir(CODEX_RUNS_DIR, { recursive: true });
  await fsp.mkdir(CODEX_REQUESTS_DIR, { recursive: true });
  await fsp.mkdir(CODEX_RESULTS_DIR, { recursive: true });
  await fsp.mkdir(CODEX_LOGS_DIR, { recursive: true });
  await fsp.mkdir(DEPLOY_REQUESTS_DIR, { recursive: true });
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, status, value) {
  send(res, status, JSON.stringify(value), {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
}

function notFound(res) {
  sendJson(res, 404, { error: "not_found" });
}

function tokenFromRequest(req, url) {
  const auth = req.headers.authorization || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  if (req.headers["x-deploy-token"]) return String(req.headers["x-deploy-token"]).trim();
  return url.searchParams.get("token") || "";
}

function validDeployToken(value) {
  if (!DEPLOY_TOKEN || !value) return false;
  const expected = Buffer.from(DEPLOY_TOKEN);
  const actual = Buffer.from(String(value));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await fsp.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function handleDeployRequest(req, res, url) {
  if (!validDeployToken(tokenFromRequest(req, url))) {
    sendJson(res, 401, { error: "invalid_deploy_token" });
    return;
  }

  const body = await readBody(req, 128 * 1024).catch(() => Buffer.alloc(0));
  let payload = {};
  try {
    payload = body.length ? JSON.parse(body.toString("utf8") || "{}") : {};
  } catch {
    sendJson(res, 400, { error: "invalid_json" });
    return;
  }
  const requestId = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const request = {
    id: requestId,
    requestedAt: new Date().toISOString(),
    ref: String(payload.ref || "current").slice(0, 120),
    note: String(payload.note || "").slice(0, 500),
    sourceIp: String(req.headers["cf-connecting-ip"] || req.socket.remoteAddress || ""),
    userAgent: String(req.headers["user-agent"] || "").slice(0, 200),
    cfRay: String(req.headers["cf-ray"] || "")
  };
  await fsp.mkdir(DEPLOY_REQUESTS_DIR, { recursive: true });
  await fsp.writeFile(path.join(DEPLOY_REQUESTS_DIR, `${requestId}.json`), JSON.stringify(request, null, 2), "utf8");
  sendJson(res, 202, { ok: true, queued: true, requestId });
}

async function handleDeployStatus(req, res, url) {
  if (!validDeployToken(tokenFromRequest(req, url))) {
    sendJson(res, 401, { error: "invalid_deploy_token" });
    return;
  }
  const pending = await fsp.readdir(DEPLOY_REQUESTS_DIR).catch(() => []);
  sendJson(res, 200, {
    ok: true,
    pending: pending.filter((name) => name.endsWith(".json")).length,
    status: await readJsonFile(DEPLOY_STATUS_FILE, null)
  });
}

function readBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > limit) {
        reject(new Error("request_body_too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseCookies(req) {
  const raw = req.headers.cookie || "";
  const out = {};
  raw.split(";").forEach((part) => {
    const [key, ...rest] = part.trim().split("=");
    if (key) out[key] = decodeURIComponent(rest.join("="));
  });
  return out;
}

function getSession(req) {
  const sid = parseCookies(req).oxsid;
  if (!sid) return null;
  const session = sessions.get(sid);
  if (!session) return null;
  if (Date.now() - session.createdAt > 1000 * 60 * 60 * 12) {
    sessions.delete(sid);
    return null;
  }
  return session;
}

function requireSession(req, res) {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { error: "unauthorized" });
    return null;
  }
  return session;
}

function safeName(input) {
  return String(input || "")
    .replace(/[^\w.\-ぁ-んァ-ヶ一-龠々ー]/g, "_")
    .slice(0, 120) || "file";
}

function escapeHtml(input) {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function textPreview(buffer, filename) {
  const ext = path.extname(filename || "").toLowerCase();
  if (![".txt", ".csv", ".md", ".json", ".log"].includes(ext)) return "";
  return buffer.toString("utf8").slice(0, 4000);
}

function parseMultipart(buffer, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  if (!match) throw new Error("missing_multipart_boundary");
  const boundary = Buffer.from("--" + (match[1] || match[2]));
  const parts = [];
  let start = buffer.indexOf(boundary);
  while (start !== -1) {
    start += boundary.length;
    if (buffer.slice(start, start + 2).toString() === "--") break;
    if (buffer.slice(start, start + 2).toString() === "\r\n") start += 2;
    const headerEnd = buffer.indexOf(Buffer.from("\r\n\r\n"), start);
    if (headerEnd === -1) break;
    const headerText = buffer.slice(start, headerEnd).toString("utf8");
    const nextBoundary = buffer.indexOf(boundary, headerEnd + 4);
    if (nextBoundary === -1) break;
    let content = buffer.slice(headerEnd + 4, nextBoundary);
    if (content.slice(-2).toString() === "\r\n") content = content.slice(0, -2);
    const disposition = /content-disposition:\s*form-data;([^\r\n]+)/i.exec(headerText)?.[1] || "";
    const name = /name="([^"]+)"/i.exec(disposition)?.[1];
    const filename = /filename="([^"]*)"/i.exec(disposition)?.[1];
    const contentTypeHeader = /content-type:\s*([^\r\n]+)/i.exec(headerText)?.[1]?.trim() || "application/octet-stream";
    if (name) parts.push({ name, filename, contentType: contentTypeHeader, content });
    start = nextBoundary;
  }

  const fields = {};
  const files = [];
  for (const part of parts) {
    if (part.filename !== undefined && part.filename !== "") {
      files.push(part);
    } else {
      fields[part.name] = part.content.toString("utf8");
    }
  }
  return { fields, files };
}

function commandExists(name) {
  const result = spawnSync("sh", ["-lc", `command -v ${name}`], { encoding: "utf8" });
  return result.status === 0;
}

async function copyIfExists(source, dest) {
  try {
    await fsp.copyFile(source, dest);
    await fsp.chmod(dest, 0o600).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

async function prepareCodexHome(appDir) {
  const sourceHome = process.env.OX_CODEX_SOURCE_HOME || path.join(process.env.HOME || "/root", ".codex");
  const runId = `${path.basename(appDir)}-${crypto.randomBytes(4).toString("hex")}`;
  const codexHome = path.join(CODEX_RUNS_DIR, runId);
  await fsp.rm(codexHome, { recursive: true, force: true });
  await fsp.mkdir(codexHome, { recursive: true, mode: 0o700 });

  const copiedAuth = await copyIfExists(path.join(sourceHome, "auth.json"), path.join(codexHome, "auth.json"));
  await copyIfExists(path.join(sourceHome, "config.toml"), path.join(codexHome, "config.toml"));
  await copyIfExists(path.join(sourceHome, "installation_id"), path.join(codexHome, "installation_id"));

  await fsp.mkdir(path.join(codexHome, "memories"), { recursive: true, mode: 0o700 });
  await fsp.mkdir(path.join(codexHome, "sessions"), { recursive: true, mode: 0o700 });
  await fsp.mkdir(path.join(codexHome, "log"), { recursive: true, mode: 0o700 });
  await fsp.mkdir(path.join(codexHome, "tmp"), { recursive: true, mode: 0o700 });

  if (!copiedAuth && !process.env.OPENAI_API_KEY) {
    throw new Error("codex_auth_not_found");
  }
  return codexHome;
}

function projectPath(id) {
  return path.join(PROJECTS_DIR, id, "project.json");
}

async function loadProjectRaw(id) {
  const raw = await fsp.readFile(projectPath(id), "utf8");
  return JSON.parse(raw);
}

async function loadProject(id) {
  const project = await loadProjectRaw(id);
  const externalLogFile = path.join(CODEX_LOGS_DIR, `${id}.log`);
  const externalLogs = await fsp.readFile(externalLogFile, "utf8")
    .then((text) => text.split(/\r?\n/).filter(Boolean))
    .catch(() => []);
  if (externalLogs.length) {
    const baseLogs = Array.isArray(project.logs) ? project.logs : [];
    project.logs = [...baseLogs, ...externalLogs];
  }
  return project;
}

async function saveProject(project) {
  await fsp.mkdir(path.join(PROJECTS_DIR, project.id), { recursive: true });
  await fsp.writeFile(projectPath(project.id), JSON.stringify(project, null, 2), "utf8");
}

async function deleteProject(id) {
  if (!/^[\w-]+$/.test(id || "")) throw new Error("invalid_project_id");
  jobs.delete(id);
  await Promise.all([
    fsp.rm(path.join(PROJECTS_DIR, id), { recursive: true, force: true }),
    fsp.rm(path.join(GENERATED_DIR, id), { recursive: true, force: true }),
    fsp.rm(path.join(UPLOADS_DIR, id), { recursive: true, force: true })
  ]);
}

async function appendLog(project, line) {
  const stamped = `[${new Date().toISOString()}] ${line}`;
  project.logs = Array.isArray(project.logs) ? project.logs : [];
  project.logs.push(stamped);
  await saveProject(project);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function selectedTemplates(ids) {
  const set = new Set(ids || []);
  return specializedTemplates.filter((item) => set.has(item.id));
}

function defaultTitle(fields, chosen) {
  const title = (fields.title || "").trim();
  if (title) return title.slice(0, 80);
  if (fields.aiType === "specialized" && chosen.length) return `${chosen[0].title}プロトタイプ`;
  return "生成AI活用プロトタイプ";
}

function generativeBlueprint(project) {
  const text = `${project.title} ${project.instruction} ${project.inputDescription} ${project.outputDescription}`;
  if (/議事|会議|todo|ToDo/i.test(text)) {
    return {
      name: "議事録・ToDo整理アプリ",
      inputLabel: "会議メモ / 音声文字起こし",
      sampleInput: "5/26 支社AI活用会議。監視カメラAIは河川と斜面で優先。佐藤さんがデータ候補を来週金曜までに整理。山田さんが自治体向け速報文テンプレートを確認。",
      outputs: ["要点サマリー", "決定事項", "担当者別ToDo", "期限・未確認事項"],
      primaryOutput: "監視カメラAIは河川・斜面を優先テーマとし、データ候補と速報文テンプレートを次回までに整理する。",
      table: [["佐藤", "データ候補を整理", "来週金曜"], ["山田", "速報文テンプレート確認", "次回会議前"], ["OX", "デモ画面を改善", "今週中"]]
    };
  }
  if (/点検|写真|損傷|報告/i.test(text)) {
    return {
      name: "点検報告書ドラフトアプリ",
      inputLabel: "点検写真メモ / ひび割れ所見",
      sampleInput: "橋梁床版下面。縦方向の細いひび割れあり。前回点検より延長がやや拡大。幅と位置を写真台帳化したい。",
      outputs: ["損傷区分", "写真台帳コメント", "報告書下書き", "不足確認事項"],
      primaryOutput: "床版下面に細いひび割れが確認され、前回点検から延長拡大の可能性があるため、幅・延長・位置の詳細確認を推奨する。",
      table: [["ひび割れ", "要記録", "幅・延長を確認"], ["位置", "要確認", "P2付近に反映"], ["次回確認", "優先", "同一角度で再撮影"]]
    };
  }
  if (/提案|PoC|顧客|相談/i.test(text)) {
    return {
      name: "提案方針・PoC案作成アプリ",
      inputLabel: "顧客相談内容 / 課題メモ",
      sampleInput: "自治体から豪雨時の河川監視を省力化したい相談。既存カメラあり。水位CSVと雨量CSVは取得可能。速報文作成も効率化したい。",
      outputs: ["課題整理", "AI活用案", "PoC構成", "メール文面"],
      primaryOutput: "既存カメラと水位・雨量データを活用し、越水リスク表示と速報文生成を組み合わせた小規模PoCから開始する。",
      table: [["Step 1", "データ確認", "2週間"], ["Step 2", "プロトタイプ作成", "3週間"], ["Step 3", "現場評価", "2週間"]]
    };
  }
  return {
    name: "業務計画書ドラフト作成アプリ",
    inputLabel: "特記仕様書 / 過去計画書",
    sampleInput: "業務名：斜面監視調査。目的：降雨時の変状把握。条件：監視カメラ、雨量計、変位計を使用。成果：月報、速報、最終報告書。",
    outputs: ["章立て", "実施方針", "工程・体制", "確認事項"],
    primaryOutput: "本業務は、監視カメラ画像と計測データを統合し、降雨時の斜面変状を早期把握することを目的とする。",
    table: [["1", "業務概要", "目的・対象・前提条件"], ["2", "実施方針", "監視・判定・報告"], ["3", "工程体制", "役割・頻度・成果物"]]
  };
}

function buildPrompt(project) {
  const templates = selectedTemplates(project.selectedTemplateIds);
  const primaryTemplate = templates[0];
  let profile = primaryTemplate ? specializedProfile(primaryTemplate.id) : null;
  if (profile?.mode === "timeseries") profile = { ...profile, ...timeseriesVariant(project) };
  const blueprint = project.aiType === "generative" ? generativeBlueprint(project) : null;
  const templateText = templates.map((item) => {
    return `- ${item.title}: ${item.description}\n  入力: ${item.inputs.join(", ")}\n  フロー: ${item.flow.join(" -> ")}\n  出力: ${item.outputs.join(", ")}`;
  }).join("\n");
  const fileText = project.files.map((file) => {
    return `- ${file.originalName} (${file.size} bytes, ${file.contentType})${file.preview ? `\n  プレビュー:\n${file.preview.slice(0, 1000)}` : ""}`;
  }).join("\n");
  const improvementText = (project.improvementHistory || []).map((item, index) => {
    return `${index + 1}. ${improvementTargetLabel(item.target)}: ${item.prompt}`;
  }).join("\n");

  return `# OX AI Workshop Builder Job

あなたは応用地質株式会社の支社向けAIワークショップで使う、体験用Webアプリのプロトタイプを作るエージェントです。
このディレクトリ内の index.html / app.css / app.js だけを必要に応じて編集してください。
外部APIキーや秘密情報は埋め込まないでください。
本番のAI判定ではなく、アップロード情報と指示文に基づいた体験用アプリとして、実際に業務画面を触っている感覚を最優先してください。
説明ページではなく、参加者が入力し、結果を見て、さらに改良したくなるWebアプリにしてください。

## 作成テーマ
${project.title}

## AI種別
${project.aiType === "specialized" ? "特化型AI開発" : "生成AI活用"}

## 参加者の指示
${project.instruction || "未入力"}

## 入力と処理
${project.inputDescription || "未入力"}

## データの使い方
${project.dataMode === "upload" ? "ユーザー提供データも使う" : "デフォルトデータで体験する"}

## 期待する出力
${project.outputDescription || "未入力"}

## 選択テンプレート
${templateText || "なし"}

## 推奨デモ設計
${blueprint ? `- アプリ名: ${blueprint.name}
- 入力欄: ${blueprint.inputLabel}
- 代表入力: ${blueprint.sampleInput}
- 出力ブロック: ${blueprint.outputs.join(" / ")}
- 代表出力: ${blueprint.primaryOutput}` : `- 現場: ${profile?.location || "現場データ"}
- 画像生成用プロンプト候補: ${profile?.imagePrompt || "現場監視画像"}
- 表示するメトリクス: ${(profile?.metrics || []).map((item) => item.join(" ")).join(" / ")}
- 時系列データ: ${(profile?.series || []).join(", ")}
- 判定コメント: ${profile?.report || ""}`}

## アップロードファイル
${fileText || "なし"}

## 改良履歴
${improvementText || "なし"}

## 変更方針
- ワークショップ参加者が「自分の業務で使えそう」と感じる画面にする。
- 入力、処理、出力、確認、改善指示の流れを明確にする。
- 操作できるボタンやタブを最低1つ以上置く。
- 余計な説明文を増やさず、画面上の文言は短くする。
- 完成アプリとして、開いた直後に主要な入力・結果・判定が見える構成にする。
- 画面は「入力/データ」「AI処理結果」「業務出力」の3つのモジュールとして整理し、改良指示では関係するモジュールだけを変更する。
- 改良時は既存の画面構成を大きく壊さず、レイアウト、文言、入力欄、結果カード、グラフ、判定根拠などを小さな単位で改善する。
- 生成AI活用の場合は、ファイルを入力し、処理し、成果物を出力する流れを強調する。
- 生成AI活用の場合は、推奨デモ設計に沿って、入力欄、実行ボタン、出力カード、表、確認事項、コピーしやすい文面を最初から配置する。
- 特化型AIの場合は、最終的にエンドユーザーが使う監視・点検・予測画面として成立させる。
- 画像系AIの場合は、地すべり・冠水域・ひび割れなどテーマごとの1ラベルだけを扱い、画像と検知結果の対応を崩さない。
- 時系列AIの場合は、データセットと目的に合わせて、異常検知または推移予測が一目で分かる完成画面にする。
- 改良履歴がある場合は、最新の改良指示を特に強く反映する。
- 静的HTML/CSS/JSだけで動くようにする。`;
}

function riskLevel(project) {
  const text = `${project.title} ${project.instruction} ${project.inputDescription} ${project.outputDescription}`.toLowerCase();
  if (text.includes("警戒") || text.includes("災害") || text.includes("冠水") || text.includes("越水") || text.includes("崩壊")) return "警戒";
  if (text.includes("注意") || text.includes("異常") || text.includes("検知")) return "注意";
  return "確認";
}

function improvementTargetLabel(target) {
  return {
    screen: "画面",
    prompt: "プロンプト",
    output: "出力",
    data: "データ"
  }[target] || "画面";
}

function latestImprovement(project) {
  const history = Array.isArray(project.improvementHistory) ? project.improvementHistory : [];
  return history[history.length - 1] || null;
}

function specializedProfile(templateId) {
  const profiles = {
    "slope-monitoring": {
      mode: "segmentation",
      location: "A-03 斜面監視カメラ",
      imagePrompt: "Photorealistic fixed-point disaster monitoring camera image of a steep forested Japanese mountain slope after heavy rain, muddy runoff near the toe, wet vegetation, overcast sky, civil engineering inspection context, no people, high detail.",
      frames: ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00"],
      annotations: [
        ["地すべり"],
        ["雨量ピーク", "変位増加", "点検優先"],
        ["警戒しきい値", "現地確認", "速報文"]
      ],
      teachTitle: "地すべり領域の確認",
      teachText: "画像上の地すべり領域だけを塗り、教師データにします。",
      aiProcess: "セグメンテーションで地すべり領域を抽出し、雨量・変位の時系列と合わせて警戒レベルを出します。",
      completedApp: "完成アプリでは、最新画像を取得するたびに地すべりマスク、変位グラフ、点検依頼文が更新されます。",
      metrics: [
        ["24h雨量", "168 mm", "警戒基準 150 mm"],
        ["累積変位", "14.6 mm", "前日比 +4.8 mm"],
        ["変位速度", "1.8 mm/h", "上昇傾向"]
      ],
      series: [2.1, 2.3, 2.9, 3.8, 5.1, 7.4, 10.2, 12.6, 14.6],
      threshold: 12,
      report: "A-03斜面では、24時間雨量が警戒基準を超過し、監視画像の中央斜面に地すべり領域が確認されます。現地確認と監視頻度の引き上げを推奨します。"
    },
    "river-monitoring": {
      mode: "segmentation",
      location: "F-02 道路冠水監視カメラ",
      imagePrompt: "Photorealistic fixed CCTV image of a Japanese road underpass during rain, water level gauge by the curb, road flooding increasing, civil engineering monitoring context, no people.",
      frames: ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00"],
      annotations: [
        ["冠水域"],
        ["水位上昇", "雨量継続", "通行判断"],
        ["通知文", "担当者共有", "現地確認"]
      ],
      teachTitle: "冠水域の確認",
      teachText: "道路上の冠水域だけを塗り、教師データにします。",
      aiProcess: "冠水域セグメンテーションと水位予測を組み合わせ、通行注意レベルと通知文を生成します。",
      completedApp: "完成アプリでは、最新カメラ画像と水位CSVから、冠水域、警戒レベル、通知文をリアルタイムに確認できます。",
      metrics: [
        ["路面水位", "31 cm", "通行注意 25 cm"],
        ["1h雨量", "42 mm", "強雨継続"],
        ["冠水率", "54%", "車線中央まで"]
      ],
      series: [3, 5, 8, 12, 16, 21, 26, 29, 31],
      threshold: 25,
      report: "F-02アンダーパスでは路面水位が通行注意ラインを超過し、画像上でも冠水域が車線中央まで広がっています。通行注意の通知と現地確認を推奨します。"
    },
    "inspection-damage": {
      mode: "segmentation",
      location: "B-07 コンクリート近接点検写真",
      imagePrompt: "Photorealistic close inspection photo of concrete surface with thin cracks only, engineering inspection lighting, high detail, no people.",
      frames: ["写真1", "写真2", "写真3", "写真4", "写真5", "現在"],
      annotations: [
        ["ひび割れ"],
        ["最大幅", "延長", "位置図"],
        ["写真台帳", "所見", "再確認"]
      ],
      teachTitle: "ひび割れの確認",
      teachText: "細いひび割れだけをなぞり、教師データにします。",
      aiProcess: "ひび割れセグメンテーションで線状損傷を抽出し、位置図と写真台帳コメントに反映します。",
      completedApp: "完成アプリでは、点検写真を追加するとひび割れ候補、位置、写真台帳コメントが自動で整理されます。",
      metrics: [
        ["検知本数", "1本", "要確認"],
        ["最大幅", "0.38 mm", "要記録"],
        ["位置", "P2付近", "位置図に反映"]
      ],
      series: [0.08, 0.12, 0.16, 0.19, 0.23, 0.28, 0.32, 0.35, 0.38],
      threshold: 0.3,
      report: "B-07近接写真では、縦方向のひび割れが検出されています。最大幅が記録基準を超えるため、位置図と写真台帳コメントへ反映します。"
    },
    "timeseries-anomaly": {
      mode: "timeseries",
      location: "S-04 地すべり計測地点",
      imagePrompt: "Realistic civil engineering sensor monitoring dashboard context for groundwater level and displacement, Japanese slope monitoring station, data logger, rainy season, professional monitoring system, no people.",
      frames: ["位置", "雨量", "地下水位", "変位速度"],
      annotations: [
        ["正常期間", "注意期間", "警戒期間"],
        ["欠測補完", "相関確認", "閾値調整"],
        ["アラート文", "担当者メモ", "確認履歴"]
      ],
      teachTitle: "教師データの確認",
      teachText: "過去の雨量・地下水位・変位と、当時の判断結果を教師データとして確認し、AIに正常・注意・警戒の境界を学習させます。",
      aiProcess: "教師データで学習したモデルが、現在値から異常スコアと24時間先の予測線を出します。",
      completedApp: "完成アプリでは、現在のセンサー値を取り込み、リアルタイムモニタリング、短期予測、アラート文生成まで行います。",
      teacherRows: [
        ["正常", "124日", "降雨後も変位速度が基準内"],
        ["注意", "18日", "地下水位上昇と変位の同時増加"],
        ["警戒", "7日", "変位速度が基準超過し現地確認済み"]
      ],
      metrics: [
        ["異常スコア", "0.87", "警戒域"],
        ["地下水位", "+0.62 m", "24h上昇"],
        ["変位速度", "1.2 mm/h", "基準超過"]
      ],
      series: [0.18, 0.22, 0.2, 0.26, 0.31, 0.46, 0.58, 0.71, 0.87],
      threshold: 0.72,
      report: "S-04センサーでは地下水位と変位速度が同時に上昇し、異常スコアが警戒域に入りました。閾値超過の根拠を示し、担当者確認を促すアラートを生成します。"
    }
  };
  return profiles[templateId] || profiles["slope-monitoring"];
}

function timeseriesVariant(project = {}) {
  const datasets = {
    slope: {
      location: "S-04 地すべり計測地点",
      frames: ["位置", "雨量", "地下水位", "変位速度"],
      metrics: [
        ["異常スコア", "0.87", "警戒域"],
        ["地下水位", "+0.62 m", "24h上昇"],
        ["変位速度", "1.2 mm/h", "基準超過"]
      ],
      series: [0.18, 0.22, 0.2, 0.26, 0.31, 0.46, 0.58, 0.71, 0.87],
      threshold: 0.72,
      report: "S-04では地下水位と変位速度が同時に上昇し、警戒域に入りました。現地確認と監視頻度の引き上げを推奨します。"
    },
    river: {
      location: "R-08 河川水位観測所",
      frames: ["位置", "雨量", "水位", "上昇速度"],
      metrics: [
        ["異常スコア", "0.74", "注意域"],
        ["水位", "+0.48 m", "6h上昇"],
        ["上昇速度", "0.18 m/h", "注意"]
      ],
      series: [0.2, 0.21, 0.24, 0.31, 0.38, 0.49, 0.58, 0.67, 0.74],
      threshold: 0.78,
      report: "R-08では水位上昇が続き、6時間先に注意ラインへ近づく予測です。巡視判断の準備を推奨します。"
    },
    road: {
      location: "F-02 道路冠水水位計",
      frames: ["位置", "雨量", "路面水位", "排水状況"],
      metrics: [
        ["異常スコア", "0.91", "警戒域"],
        ["路面水位", "31 cm", "通行注意超過"],
        ["排水能力", "低下", "雨量超過"]
      ],
      series: [0.16, 0.2, 0.28, 0.36, 0.48, 0.61, 0.73, 0.84, 0.91],
      threshold: 0.7,
      report: "F-02では路面水位が通行注意ラインを超え、排水能力を上回る雨量が継続しています。通行注意通知を推奨します。"
    }
  };
  const dataset = datasets[project.timeseriesDataset] || datasets.slope;
  const goal = project.timeseriesGoal === "anomaly" ? "anomaly" : "forecast";
  return {
    ...dataset,
    goal,
    goalLabel: goal === "anomaly" ? "異常検知" : "推移予測",
    report: goal === "anomaly"
      ? `${dataset.location}の現在値を異常検知モデルで評価しました。${dataset.report}`
      : `${dataset.location}の現在値から24時間先までの推移を予測しました。${dataset.report}`
  };
}

function chartSvg(values, threshold) {
  const width = 620;
  const height = 220;
  const pad = 34;
  const maxValue = Math.max(...values, threshold) * 1.12;
  const minValue = Math.min(0, ...values);
  const xStep = (width - pad * 2) / (values.length - 1);
  const y = (value) => height - pad - ((value - minValue) / (maxValue - minValue || 1)) * (height - pad * 2);
  const points = values.map((value, index) => `${pad + xStep * index},${y(value).toFixed(1)}`).join(" ");
  const thresholdY = y(threshold).toFixed(1);
  const last = values[values.length - 1];
  return `<svg class="data-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="時系列データ">
    <defs>
      <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#1d63b7" stop-opacity="0.28"/>
        <stop offset="1" stop-color="#1d63b7" stop-opacity="0.02"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${width}" height="${height}" rx="10" fill="#f8fbff"/>
    <g stroke="#d6e1ee" stroke-width="1">
      <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}"/>
      <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}"/>
      <line x1="${pad}" y1="${thresholdY}" x2="${width - pad}" y2="${thresholdY}" stroke="#d98a1d" stroke-dasharray="6 6"/>
    </g>
    <polygon points="${pad},${height - pad} ${points} ${width - pad},${height - pad}" fill="url(#chartFill)"/>
    <polyline points="${points}" fill="none" stroke="#1d63b7" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    ${values.map((value, index) => `<circle cx="${pad + xStep * index}" cy="${y(value).toFixed(1)}" r="${index === values.length - 1 ? 6 : 4}" fill="${value >= threshold ? "#d98a1d" : "#1d63b7"}"/>`).join("")}
    <text x="${width - pad - 96}" y="${Number(thresholdY) - 8}" fill="#875813" font-size="12" font-weight="700">警戒しきい値</text>
    <text x="${width - pad - 84}" y="${y(last) - 12}" fill="#0b3d78" font-size="13" font-weight="800">最新値</text>
  </svg>`;
}

function sceneSvg(templateId, profile) {
  const title = escapeHtml(profile.location);
  const frameText = profile.frames.map((frame) => escapeHtml(frame));
  return `<div class="photo-scene ${escapeHtml(templateId)}" role="img" aria-label="${title}">
    <div class="scene-title">${title}</div>
    <div class="scene-strip">
      ${frameText.map((frame, index) => `<span class="${index === frameText.length - 1 ? "active" : ""}">${frame}</span>`).join("")}
    </div>
  </div>`;
}

function monitoringSlug(templateId) {
  return {
    "slope-monitoring": "slope",
    "river-monitoring": "flood",
    "inspection-damage": "crack"
  }[templateId] || "flood";
}

function monitoringFrameSrc(templateId, index) {
  return `/assets/monitoring/${monitoringSlug(templateId)}/frame-${String(index).padStart(2, "0")}.jpg`;
}

function segRegion(label, d, x, y, secondary = false, kind = "area") {
  return { label, path: d, x, y, w: 14, h: 14, muted: secondary, kind };
}

function monitoringRegions(templateId, frameIndex) {
  if (templateId === "slope-monitoring") {
    const frames = {
      0: [],
      1: [segRegion("地すべり", "M 64 31 C 70 33 74 40 73 50 C 71 59 65 66 57 68 C 53 64 54 55 58 47 C 61 41 61 35 64 31 Z", 63, 35)],
      2: [segRegion("地すべり", "M 65 28 C 73 31 78 41 76 54 C 74 65 66 73 56 76 C 50 70 52 58 57 48 C 62 39 61 32 65 28 Z", 63, 33)],
      3: [segRegion("地すべり", "M 64 26 C 74 29 79 40 78 55 C 76 68 67 76 55 79 C 49 72 51 59 57 48 C 62 39 60 31 64 26 Z", 63, 32)],
      4: [segRegion("地すべり", "M 65 24 C 75 28 81 40 79 56 C 77 69 68 78 56 80 C 50 74 51 61 58 49 C 63 40 61 30 65 24 Z", 64, 31)],
      5: [segRegion("地すべり", "M 66 25 C 75 28 80 39 79 54 C 77 67 69 76 57 79 C 51 73 52 61 58 50 C 63 41 62 31 66 25 Z", 64, 31)]
    };
    return frames[frameIndex] || frames[5];
  }
  if (templateId === "inspection-damage") {
    const frames = {
      0: [segRegion("ひび割れ", "M 10 12 C 23 25 28 39 39 50 C 48 59 55 70 66 84", 21, 24, false, "line")],
      1: [segRegion("ひび割れ", "M 54 2 C 53 16 51 27 53 38 C 55 48 51 57 53 68 C 55 80 57 91 56 99 M 52 41 C 42 36 34 31 26 24 M 54 48 C 63 43 70 36 78 29", 50, 13, false, "line")],
      2: [segRegion("ひび割れ", "M 9 6 C 18 18 27 29 36 41 C 47 55 59 68 73 86", 18, 18, false, "line")],
      3: [segRegion("ひび割れ", "M 1 95 C 14 79 27 62 40 48 C 51 36 62 24 74 9", 17, 74, false, "line")],
      4: [segRegion("ひび割れ", "M 54 4 C 52 17 50 31 51 44 C 53 57 50 72 51 87 C 52 94 52 98 52 100", 50, 16, false, "line")],
      5: [segRegion("ひび割れ", "M 51 0 C 52 11 51 22 52 34 C 54 47 51 58 53 70 C 54 82 55 93 55 100", 50, 16, false, "line")]
    };
    return frames[frameIndex] || frames[5];
  }
  const flood = {
    0: [segRegion("冠水域", "M 0 68 C 16 62 37 65 55 72 C 47 86 31 97 7 100 L 0 100 Z", 8, 74)],
    1: [segRegion("冠水域", "M 0 57 C 18 51 39 54 58 64 C 58 80 38 96 4 100 L 0 100 Z", 8, 68)],
    2: [segRegion("冠水域", "M 0 50 C 22 45 49 49 74 63 C 77 80 50 97 5 100 L 0 100 Z", 9, 62)],
    3: [segRegion("冠水域", "M 0 46 C 23 40 51 42 78 58 C 83 79 58 96 4 100 L 0 100 Z", 9, 57)],
    4: [segRegion("冠水域", "M 0 40 C 28 37 58 41 85 57 C 94 77 67 98 4 100 L 0 100 Z", 9, 53)],
    5: [segRegion("冠水域", "M 0 35 C 29 31 62 37 92 55 C 100 75 78 96 8 100 L 0 100 Z", 9, 49)]
  };
  return flood[frameIndex] || flood[5];
}

function imageFrameStates(templateId, profile) {
  const labels = profile.frames.length ? profile.frames : ["1", "2", "3", "4", "5", "6"];
  const frame = (index, risk, metrics, regions, result) => ({
    frame: labels[index] || `フレーム${index + 1}`,
    frameIndex: index,
    image: monitoringFrameSrc(templateId, index),
    risk,
    metrics,
    regions,
    result
  });
  if (templateId === "slope-monitoring") {
    return [
      frame(0, "正常", [["34 mm", "基準内"], ["2.1 mm", "安定"], ["0.2 mm/h", "変化小"]], monitoringRegions(templateId, 0), "斜面は安定しています。雨量・変位とも基準内で、追加確認は不要です。"),
      frame(1, "正常", [["68 mm", "上昇中"], ["2.6 mm", "微増"], ["0.3 mm/h", "監視継続"]], monitoringRegions(templateId, 1), "降雨により斜面中央の地すべり候補が小さく見え始めています。変位は小さく、監視継続の判断です。"),
      frame(2, "注意", [["112 mm", "注意基準付近"], ["5.4 mm", "増加"], ["0.7 mm/h", "上昇"]], monitoringRegions(templateId, 2), "地すべり領域が斜面中央で明瞭になっています。雨量と変位の上昇を合わせて注意判定です。"),
      frame(3, "注意", [["138 mm", "注意基準超過"], ["8.7 mm", "増加"], ["1.1 mm/h", "要確認"]], monitoringRegions(templateId, 3), "地すべり領域が拡大しています。現地確認候補として記録します。"),
      frame(4, "警戒", [["168 mm", "警戒基準 150 mm"], ["14.6 mm", "前日比 +4.8 mm"], ["1.8 mm/h", "上昇傾向"]], monitoringRegions(templateId, 4), profile.report),
      frame(5, "警戒", [["176 mm", "警戒継続"], ["15.9 mm", "増加継続"], ["1.9 mm/h", "監視頻度UP"]], monitoringRegions(templateId, 5), "地すべり領域が前時刻より拡大しています。監視頻度の引き上げと現地確認を推奨します。")
    ];
  }
  if (templateId === "inspection-damage") {
    return [
      frame(0, "正常", [["1本", "微細"], ["0.12 mm", "経過観察"], ["P1", "記録"]], monitoringRegions(templateId, 0), "細いひび割れを1本検出しました。現時点では経過観察レベルです。"),
      frame(1, "注意", [["1本", "分岐あり"], ["0.24 mm", "記録"], ["P1-P2", "写真台帳"]], monitoringRegions(templateId, 1), "分岐を伴うひび割れ候補があります。写真台帳への記録対象です。"),
      frame(2, "注意", [["1本", "連続"], ["0.31 mm", "要記録"], ["P2", "位置図反映"]], monitoringRegions(templateId, 2), "ひび割れが連続して見えます。位置図に反映して確認します。"),
      frame(3, "注意", [["1本", "長い"], ["0.36 mm", "要記録"], ["P2", "確認"]], monitoringRegions(templateId, 3), "ひび割れ延長が長く、最大幅も記録対象です。"),
      frame(4, "警戒", [["1本", "要確認"], ["0.38 mm", "基準超過"], ["P2", "報告書反映"]], monitoringRegions(templateId, 4), profile.report),
      frame(5, "警戒", [["1本", "要確認"], ["0.42 mm", "優先確認"], ["P2", "早期確認"]], monitoringRegions(templateId, 5), "細いひび割れの幅が広がっています。早期確認対象として報告書下書きへ反映します。")
    ];
  }
  return [
    frame(0, "正常", [["3 cm", "平常"], ["6 mm/h", "小雨"], ["6%", "路肩のみ"]], monitoringRegions(templateId, 0), "路面水位は低く、冠水域は路肩付近に限られています。通常監視を継続します。"),
    frame(1, "正常", [["7 cm", "上昇開始"], ["18 mm/h", "降雨継続"], ["14%", "路肩滞水"]], monitoringRegions(templateId, 1), "路肩側に滞水が出ています。現時点では通行注意ライン未満です。"),
    frame(2, "注意", [["14 cm", "注意接近"], ["28 mm/h", "強雨"], ["27%", "冠水開始"]], monitoringRegions(templateId, 2), "道路左側の冠水域が広がり始めています。水位上昇に注意します。"),
    frame(3, "注意", [["22 cm", "注意付近"], ["36 mm/h", "強雨継続"], ["39%", "車線冠水"]], monitoringRegions(templateId, 3), "冠水域が車線中央まで広がっています。通行注意の準備が必要です。"),
    frame(4, "警戒", [["29 cm", "通行注意 25 cm"], ["42 mm/h", "強雨継続"], ["48%", "車線中央"]], monitoringRegions(templateId, 4), profile.report),
    frame(5, "警戒", [["31 cm", "上昇継続"], ["38 mm/h", "雨継続"], ["54%", "通行注意"]], monitoringRegions(templateId, 5), "路面水位はさらに上昇し、冠水域が広がっています。通行注意の通知と現地確認が必要です。")
  ];
}

function generatedIndex(project) {
  const templates = selectedTemplates(project.selectedTemplateIds);
  const primaryTemplate = templates[0];
  const improvement = latestImprovement(project);
  const improvementNote = improvement
    ? `${improvementTargetLabel(improvement.target)}の改良指示: ${improvement.prompt}`
    : "";
  const samplePreview = project.files.find((file) => file.preview)?.preview || "";
  const level = riskLevel(project);
  const usesDefaultData = project.files.length === 0 || project.dataMode !== "upload";
  const dataLabel = usesDefaultData
    ? "デフォルトデータ"
    : project.files.map((file) => file.originalName).join("、");
  const features = (primaryTemplate?.features || primaryTemplate?.flow || []).slice(0, 3);
  const templateId = primaryTemplate?.id || "slope-monitoring";
  let profile = specializedProfile(templateId);
  if (profile.mode === "timeseries") profile = { ...profile, ...timeseriesVariant(project) };
  const blueprint = generativeBlueprint(project);
  const annotations = profile.annotations[0];
  const isTimeseries = profile.mode === "timeseries";
  const frameStates = imageFrameStates(templateId, profile);
  const specializedSummary = primaryTemplate
    ? `${primaryTemplate.title}の完成デモです。最新データを取り込み、AI判定・予測・速報文を業務画面で確認できます。`
    : "AI判定と出力を確認できる業務デモです。";
  const generativeSummary = "生成AI活用の指示から作成した、すぐ試せる業務アプリです。";
  const specializedScene = isTimeseries ? `
    <div class="camera-card live-monitor-card">
      <div class="camera-toolbar">
        <strong>${escapeHtml(profile.location)}</strong>
        <span id="liveFrameLabel">リアルタイム監視中</span>
      </div>
      <div class="live-value-grid">
        <div><span>雨量</span><strong id="liveRain">42 mm/h</strong></div>
        <div><span>${escapeHtml(profile.metrics[1]?.[0] || "地下水位")}</span><strong id="liveWater">${escapeHtml(profile.metrics[1]?.[1] || "+0.62 m")}</strong></div>
        <div><span>${escapeHtml(profile.metrics[2]?.[0] || "変位速度")}</span><strong id="liveMove">${escapeHtml(profile.metrics[2]?.[1] || "1.2 mm/h")}</strong></div>
        <div><span>異常スコア</span><strong id="liveScore">0.87</strong></div>
      </div>
      <div class="sensor-strip">
        ${profile.frames.map((frame, index) => `<span class="${index === profile.frames.length - 1 ? "active" : ""}">${escapeHtml(frame)}</span>`).join("")}
      </div>
      <svg id="livePredictionChart" class="data-chart live-chart" viewBox="0 0 640 260" role="img" aria-label="リアルタイム予測グラフ"></svg>
    </div>` : `
    <div class="camera-card live-monitor-card">
      <div class="camera-toolbar">
        <strong>${escapeHtml(profile.location)}</strong>
        <span id="liveFrameLabel">${escapeHtml(profile.frames[profile.frames.length - 1] || "現在")}</span>
      </div>
      <div class="photo-stage">
        <img id="liveImage" class="monitor-frame" src="${escapeHtml(frameStates[0].image)}" alt="${escapeHtml(profile.location)}">
        <div id="aiOverlay" class="ai-overlay"></div>
      </div>
      <div class="thumb-row">
        ${profile.frames.map((frame, index) => `<span class="${index === 0 ? "active" : ""}">${escapeHtml(frame)}</span>`).join("")}
      </div>
    </div>`;
  const specializedDemo = `
    <section class="demo-board">
      <div class="demo-head">
        <div>
          <span class="tag">${escapeHtml(primaryTemplate?.tag || "特化型AI")}</span>
          <h2>${escapeHtml(primaryTemplate?.title || "AIモニタリング")}モニタリング</h2>
          ${improvementNote ? `<p class="improvement-note">${escapeHtml(improvementNote)}</p>` : ""}
        </div>
        <div class="risk ${level === "警戒" ? "alert" : level === "注意" ? "watch" : ""}" id="riskCard">
          <span>AI判定</span>
          <strong id="riskLevel">${escapeHtml(level)}</strong>
        </div>
      </div>
      <div class="monitor-grid">
        ${specializedScene}
        <div class="insight-card">
          <h3>${isTimeseries ? profile.goalLabel : "AI検知結果"}</h3>
          <div class="metric-stack">
            ${profile.metrics.map(([label, value, note], index) => `<div><span>${escapeHtml(label)}</span><strong id="metricValue${index}">${escapeHtml(value)}</strong><small id="metricNote${index}">${escapeHtml(note)}</small></div>`).join("")}
          </div>
          ${isTimeseries ? `<div class="live-card"><strong>${escapeHtml(profile.goalLabel)}</strong><p id="liveSummary">現在値を使って判定と予測を更新しています。</p></div>` : chartSvg(profile.series, profile.threshold)}
          <button id="runDemoBtn">${isTimeseries ? "最新値で予測" : "最新画像を更新"}</button>
        </div>
      </div>
      <div class="result-panel" id="demoResult">
        <h3>${templateId === "river-monitoring" ? "通行注意通知文" : templateId === "inspection-damage" ? "点検報告コメント" : templateId === "timeseries-anomaly" ? "予測アラート文" : "点検依頼文"}</h3>
        <p>${escapeHtml(profile.report)}</p>
        ${improvementNote ? `<p>${escapeHtml(improvement.prompt)}</p>` : ""}
      </div>
    </section>`;
  const generativeDemo = `
    <section class="demo-board">
      <div class="demo-head">
        <div>
          <span class="tag">生成AI活用</span>
          <h2>完成デモ：${escapeHtml(blueprint.name)}</h2>
          ${improvementNote ? `<p class="improvement-note">${escapeHtml(improvementNote)}</p>` : ""}
        </div>
      </div>
      <div class="generator-grid">
        <label class="demo-input">
          <span>${escapeHtml(blueprint.inputLabel)}</span>
          <textarea id="demoPrompt">${escapeHtml(samplePreview || blueprint.sampleInput)}</textarea>
        </label>
        <section class="demo-output">
          <div class="output-head">
            <span>AI出力</span>
            <button id="runDemoBtn">生成する</button>
          </div>
          <div id="demoResult">
            <h3>${escapeHtml(project.title)}</h3>
            <p class="draft-text">${escapeHtml(blueprint.primaryOutput)}</p>
            <div class="output-cards">
              ${blueprint.outputs.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
            </div>
            <table>
              <tbody>
                ${blueprint.table.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}
              </tbody>
            </table>
            ${improvement ? `<p class="improvement-note">${escapeHtml(improvementTargetLabel(improvement.target))}の改良を反映: ${escapeHtml(improvement.prompt)}</p>` : ""}
          </div>
        </section>
      </div>
    </section>`;

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(project.title)} | OX AI Prototype</title>
  <link rel="stylesheet" href="./app.css">
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">OX AI Builder</p>
        <h1>${escapeHtml(project.title)}</h1>
      </div>
      <nav class="demo-actions">
        <a href="/">トップに戻る</a>
        <a href="/#archive:${project.id}">AIで改良する</a>
      </nav>
    </header>

    ${project.aiType === "generative" ? `<section class="panel what-ai">
        <h2>${project.aiType === "specialized" ? "このAIがすること" : "この生成AIアプリがすること"}</h2>
        <p>${project.aiType === "specialized" ? escapeHtml(primaryTemplate?.description || "業務データから必要な判断を支援するAI処理を作ります。") : escapeHtml(generativeSummary)}</p>
        <dl>
          <dt>使うデータ</dt>
          <dd>${escapeHtml(dataLabel || project.inputDescription || "入力データ")}</dd>
          <dt>出力</dt>
          <dd>${escapeHtml(project.outputDescription || "業務で確認できる画面と文章")}</dd>
        </dl>
    </section>` : ""}

    ${project.aiType === "specialized" ? specializedDemo : generativeDemo}
  </main>
  <script src="./app.js"></script>
</body>
</html>`;
}

function generatedCss() {
  return `:root {
  color-scheme: light;
  --ink: #102033;
  --muted: #607286;
  --line: #d6e1ee;
  --paper: #f5f8fc;
  --panel: #ffffff;
  --teal: #1d63b7;
  --teal-dark: #0b3d78;
  --soft: #e8f2ff;
  --amber: #d98a1d;
  --red: #b54848;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: var(--paper);
  color: var(--ink);
}
.shell {
  width: min(1180px, calc(100% - 32px));
  margin: 0 auto;
  padding: 28px 0 48px;
}
.topbar {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: flex-start;
  border-bottom: 1px solid var(--line);
  padding-bottom: 20px;
  margin-bottom: 20px;
}
.demo-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.demo-actions a {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 8px 12px;
  color: var(--teal-dark);
  font-weight: 800;
  text-decoration: none;
  background: #fff;
}
.eyebrow {
  margin: 0 0 6px;
  color: var(--teal);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}
h1, h2, h3, p { margin-top: 0; }
h1 { font-size: clamp(28px, 4vw, 44px); line-height: 1.18; margin-bottom: 10px; }
h2 { font-size: 20px; }
h3 { font-size: 17px; }
p { color: var(--muted); line-height: 1.7; }
button {
  border: 0;
  background: var(--teal);
  color: white;
  padding: 10px 14px;
  border-radius: 6px;
  font-weight: 700;
  cursor: pointer;
}
.panel, aside, .demo-board {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 18px;
}
.what-ai {
  margin-bottom: 16px;
}
.what-ai dl {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 10px 14px;
  margin: 16px 0 0;
}
.what-ai dt {
  font-weight: 800;
  color: var(--teal-dark);
}
.what-ai dd {
  margin: 0;
  color: var(--muted);
}
.demo-board {
  margin-top: 16px;
}
.demo-head {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  align-items: flex-start;
  margin-bottom: 16px;
}
.ai-workflow {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}
.ai-workflow div {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #f8fbff;
  padding: 12px;
}
.ai-workflow span {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--soft);
  color: var(--teal-dark);
  display: grid;
  place-items: center;
  font-weight: 900;
  margin-bottom: 8px;
}
.ai-workflow strong,
.ai-workflow small {
  display: block;
}
.ai-workflow small {
  color: var(--muted);
  line-height: 1.55;
  margin-top: 5px;
}
.risk {
  min-width: 120px;
  border: 1px solid var(--line);
  border-left: 4px solid var(--teal);
  border-radius: 8px;
  padding: 12px;
  background: #f8fbff;
}
.risk span {
  display: block;
  color: var(--muted);
  font-size: 12px;
}
.risk strong {
  font-size: 28px;
}
.risk.watch { border-left-color: var(--amber); }
.risk.alert { border-left-color: var(--red); }
.monitor-grid, .generator-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(300px, 0.7fr);
  gap: 14px;
}
.tag {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--soft);
  color: var(--teal-dark);
  font-size: 12px;
  font-weight: 800;
  margin-bottom: 8px;
}
.improvement-note {
  border-left: 4px solid var(--teal);
  background: #f8fbff;
  padding: 10px 12px;
  border-radius: 6px;
}
.camera-card, .insight-card, .demo-input, .demo-output, .result-panel {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  padding: 14px;
}
.live-monitor-card {
  background: linear-gradient(180deg, #ffffff, #f8fbff);
}
.camera-toolbar, .output-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}
.camera-toolbar span, .demo-input span, .output-head span {
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
}
.photo-stage {
  position: relative;
  overflow: hidden;
  border-radius: 8px;
  background: #d9e6f4;
  aspect-ratio: 1 / 1;
  min-height: 0;
  max-width: 560px;
}
.monitor-frame {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: opacity 0.45s ease;
}
.ai-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.segmentation-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.seg-region {
  fill: rgba(29, 99, 183, 0.3);
  stroke: none;
  filter: drop-shadow(0 10px 22px rgba(11, 61, 120, 0.2));
}
.seg-region.muted {
  fill: rgba(29, 99, 183, 0.12);
}
.seg-edge {
  fill: none;
  stroke: #ffdf5d;
  stroke-width: 0.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.seg-line,
.seg-line-edge {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.seg-line {
  stroke: rgba(29, 99, 183, 0.46);
  stroke-width: 2.4;
  filter: drop-shadow(0 8px 18px rgba(11, 61, 120, 0.2));
}
.seg-line-edge {
  stroke: #ffdf5d;
  stroke-width: 0.72;
}
.seg-label {
  font-size: 3.3px;
  font-weight: 900;
  fill: var(--teal-dark);
  paint-order: stroke;
  stroke: rgba(255, 255, 255, 0.88);
  stroke-width: 1.5px;
}
.detect-region {
  position: absolute;
  border: 3px solid #ffdf5d;
  background: rgba(29, 99, 183, 0.22);
  color: #16324f;
  border-radius: 12px 18px 16px 20px;
  box-shadow: 0 0 0 999px rgba(12, 38, 68, 0.025), 0 10px 24px rgba(11, 61, 120, 0.16);
}
.detect-region.muted {
  border-color: rgba(29, 99, 183, 0.55);
  background: rgba(29, 99, 183, 0.08);
}
.detect-region span {
  position: absolute;
  left: 8px;
  top: 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--teal-dark);
  padding: 5px 8px;
  font-size: 12px;
  font-weight: 900;
}
.photo-scene {
  position: relative;
  width: 100%;
  min-height: 390px;
  background-image: linear-gradient(180deg, rgba(8, 24, 44, 0.06), rgba(8, 24, 44, 0.22)), url("/assets/field-ai-demo-grid.png");
  background-size: 200% 200%;
  background-repeat: no-repeat;
  transition: background-position 2.1s ease, background-size 2.1s ease, filter 2.1s ease, transform 2.1s ease;
}
.photo-scene.slope-monitoring { background-position: 0 0; }
.photo-scene.river-monitoring { background-position: 100% 0; }
.photo-scene.inspection-damage { background-position: 0 100%; }
.photo-scene.timeseries-anomaly { background-position: 100% 100%; }
.photo-stage.frame-a .photo-scene {
  background-size: 215% 215%;
  background-position: 88% 0;
  filter: saturate(0.92) brightness(1.04);
}
.photo-stage.frame-b .photo-scene {
  background-size: 230% 230%;
  background-position: 78% 5%;
  filter: saturate(1.08) contrast(1.02);
  transform: scale(1.01);
}
.photo-stage.frame-c .photo-scene {
  background-size: 245% 245%;
  background-position: 68% 8%;
  filter: saturate(1.18) contrast(1.06);
  transform: scale(1.02);
}
.photo-stage.frame-a .photo-scene.slope-monitoring { background-position: 0 0; }
.photo-stage.frame-b .photo-scene.slope-monitoring { background-position: 8% 6%; }
.photo-stage.frame-c .photo-scene.slope-monitoring { background-position: 14% 10%; }
.photo-stage.frame-a .photo-scene.inspection-damage { background-position: 0 88%; }
.photo-stage.frame-b .photo-scene.inspection-damage { background-position: 8% 78%; }
.photo-stage.frame-c .photo-scene.inspection-damage { background-position: 15% 68%; }
.segmentation-mask {
  position: absolute;
  left: 15%;
  right: 13%;
  bottom: 14%;
  height: 34%;
  background: rgba(45, 142, 224, 0.28);
  border: 2px solid rgba(255, 222, 93, 0.9);
  clip-path: polygon(9% 70%, 30% 42%, 48% 48%, 68% 25%, 90% 46%, 96% 82%, 61% 92%, 28% 88%);
  mix-blend-mode: screen;
  animation: maskPulse 2.8s ease-in-out infinite;
  pointer-events: none;
  transition: left 2.1s ease, right 2.1s ease, bottom 2.1s ease, height 2.1s ease, clip-path 2.1s ease;
}
.photo-stage.frame-a .segmentation-mask {
  left: 8%;
  right: 34%;
  bottom: 18%;
  height: 24%;
  clip-path: polygon(0 68%, 28% 42%, 72% 38%, 100% 72%, 74% 100%, 18% 90%);
}
.photo-stage.frame-b .segmentation-mask {
  left: 36%;
  right: 10%;
  bottom: 22%;
  height: 31%;
  clip-path: polygon(8% 34%, 44% 12%, 88% 42%, 100% 80%, 52% 100%, 16% 82%);
}
.photo-stage.frame-c .segmentation-mask {
  left: 18%;
  right: 20%;
  bottom: 10%;
  height: 42%;
}
@keyframes maskPulse {
  0%, 100% { opacity: 0.62; filter: saturate(1); }
  50% { opacity: 0.96; filter: saturate(1.35); }
}
.scene-title {
  position: absolute;
  left: 16px;
  top: 16px;
  border-radius: 8px;
  background: rgba(16, 32, 51, 0.76);
  color: #fff;
  padding: 10px 12px;
  font-weight: 900;
}
.scene-strip {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
  gap: 8px;
}
.scene-strip span {
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.86);
  color: var(--teal-dark);
  padding: 9px;
  text-align: center;
  font-size: 12px;
  font-weight: 900;
}
.scene-strip span.active {
  background: #fff2bf;
  color: #684700;
}
.sky {
  position: absolute;
  inset: 0 0 50% 0;
  background: linear-gradient(#c9e5ff, #f7fbff);
}
.slope {
  position: absolute;
  left: -8%;
  right: -6%;
  bottom: 0;
  height: 74%;
  background: linear-gradient(145deg, #667761, #9ea66b);
  transform: skewY(-10deg);
  transform-origin: left bottom;
}
.river {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 24%;
  background: linear-gradient(90deg, #356c96, #72a7c8);
}
.structure {
  display: none;
  position: absolute;
}
.visual-frame.river-monitoring .slope {
  height: 30%;
  bottom: 0;
  transform: none;
  background: linear-gradient(#ba9e76, #8f7a5d);
}
.visual-frame.river-monitoring .river {
  height: 54%;
  background: linear-gradient(90deg, #7d896b, #5e8397, #8d7555);
}
.visual-frame.river-monitoring .structure {
  display: block;
  left: 10%;
  right: 10%;
  top: 34%;
  height: 12px;
  background: #e6edf5;
  box-shadow: 0 18px 0 #bdc9d7;
}
.visual-frame.inspection-damage {
  background: linear-gradient(135deg, #aeb7c2, #e5ebf1);
}
.visual-frame.inspection-damage .sky,
.visual-frame.inspection-damage .river {
  display: none;
}
.visual-frame.inspection-damage .slope {
  inset: 22px;
  height: auto;
  transform: none;
  background:
    linear-gradient(90deg, transparent 49%, rgba(65, 75, 88, 0.35) 50%, transparent 51%),
    linear-gradient(#c8d0d8, #9da9b4);
  border-radius: 8px;
}
.visual-frame.timeseries-anomaly {
  background: #f8fbff;
}
.visual-frame.timeseries-anomaly .sky,
.visual-frame.timeseries-anomaly .slope,
.visual-frame.timeseries-anomaly .river {
  display: none;
}
.visual-frame.timeseries-anomaly::before {
  content: "";
  position: absolute;
  inset: 36px;
  border-left: 2px solid #8ca4bf;
  border-bottom: 2px solid #8ca4bf;
  background:
    linear-gradient(135deg, transparent 45%, rgba(29, 99, 183, 0.2) 46%, rgba(29, 99, 183, 0.2) 50%, transparent 51%),
    repeating-linear-gradient(0deg, transparent, transparent 38px, rgba(118, 145, 176, 0.18) 39px),
    repeating-linear-gradient(90deg, transparent, transparent 58px, rgba(118, 145, 176, 0.18) 59px);
}
.detect-box {
  position: absolute;
  border: 2px solid #ffdf5d;
  background: rgba(255, 223, 93, 0.18);
  color: #4f3d00;
  border-radius: 6px;
  padding: 6px 8px;
  font-weight: 800;
  font-size: 13px;
}
.detect-box.one { left: 48%; top: 34%; }
.detect-box.two { left: 16%; bottom: 16%; }
.detect-box.three { right: 10%; top: 18%; }
.thumb-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(74px, 1fr));
  gap: 8px;
  margin-top: 10px;
}
.thumb-row span {
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 8px;
  text-align: center;
  color: var(--muted);
  font-size: 12px;
  font-weight: 800;
  background: #fff;
}
.thumb-row span.active {
  border-color: var(--teal);
  color: var(--teal-dark);
  background: var(--soft);
}
.annotation-tools,
.sensor-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
  gap: 8px;
  margin-top: 10px;
}
.annotation-tools span,
.sensor-strip span {
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 8px;
  background: #e8f2ff;
  color: var(--teal-dark);
  font-size: 12px;
  font-weight: 900;
  text-align: center;
}
.sensor-strip span.active {
  background: #fff2bf;
  border-color: #e6bf3f;
  color: #684700;
}
.teacher-card,
.live-card {
  border: 1px solid var(--line);
  border-left: 4px solid var(--teal);
  border-radius: 8px;
  background: #fff;
  padding: 14px;
  margin-bottom: 12px;
}
.teacher-card p:last-child,
.live-card p:last-child {
  margin-bottom: 0;
}
.teacher-summary {
  background: #f8fbff;
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--teal-dark);
  font-weight: 900;
  padding: 8px 10px;
}
.live-value-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 10px;
}
.live-value-grid div {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #f8fbff;
  padding: 10px;
}
.live-value-grid span {
  display: block;
  color: var(--muted);
  font-size: 11px;
  font-weight: 800;
}
.live-value-grid strong {
  display: block;
  margin-top: 4px;
  color: var(--teal-dark);
  font-size: 19px;
}
.live-chart {
  min-height: 250px;
  background: #f8fbff;
}
.metric-stack {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}
.metric-stack div {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px;
  background: #f8fbff;
}
.metric-stack span,
.metric-stack small {
  display: block;
  color: var(--muted);
  font-size: 11px;
}
.metric-stack strong {
  display: block;
  margin: 4px 0;
  color: var(--ink);
  font-size: 20px;
}
.data-chart {
  width: 100%;
  height: auto;
  margin-bottom: 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
}
.insight-card ul, .demo-output ul {
  color: var(--muted);
  line-height: 1.7;
  padding-left: 20px;
}
.tiny-chart {
  height: 108px;
  display: flex;
  align-items: end;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  margin-bottom: 12px;
}
.tiny-chart span {
  flex: 1;
  border-radius: 4px 4px 0 0;
  background: linear-gradient(#5ba7e6, #1d63b7);
}
.tiny-chart .warn {
  background: linear-gradient(#f2b765, #d98a1d);
}
.result-panel {
  margin-top: 14px;
  border-left: 4px solid var(--teal);
  background: #f8fbff;
}
.demo-input {
  display: grid;
  gap: 10px;
}
.demo-input textarea {
  width: 100%;
  min-height: 260px;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 12px;
  resize: vertical;
}
.demo-output {
  min-height: 260px;
}
.draft-text {
  border-left: 4px solid var(--teal);
  background: #f8fbff;
  border-radius: 6px;
  padding: 10px 12px;
  color: var(--ink);
}
.output-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 12px 0;
}
.output-cards span {
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 9px;
  background: #fff;
  color: var(--teal-dark);
  font-weight: 800;
  font-size: 13px;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
}
td {
  border: 1px solid var(--line);
  padding: 9px;
  color: var(--muted);
}
td:first-child {
  color: var(--ink);
  font-weight: 800;
  width: 96px;
}
pre {
  white-space: pre-wrap;
  max-height: 240px;
  overflow: auto;
  background: #102033;
  color: #f5f8fc;
  border-radius: 6px;
  padding: 12px;
}
@media (max-width: 820px) {
  .monitor-grid, .generator-grid, .demo-head, .topbar { grid-template-columns: 1fr; display: grid; }
  .ai-workflow { grid-template-columns: 1fr; }
  .metric-stack { grid-template-columns: 1fr; }
  .live-value-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .risk { width: 100%; }
}`;
}

function timeseriesAnimationStates(profile) {
  const isRoad = profile.location.includes("道路");
  const isRiver = profile.location.includes("河川");
  if (isRoad) {
    return [
      { label: "現在 14:00", risk: "注意", rain: "28 mm/h", water: "18 cm", move: "稼働中", score: "0.66", series: [0.16, 0.19, 0.24, 0.3, 0.39, 0.48, 0.56, 0.61, 0.66], forecast: [0.71, 0.78, 0.84], summary: "路面水位が上昇中です。排水能力を上回る雨量が続くと警戒域へ入ります。", result: "現在値では注意域です。6から12時間後に通行注意ラインへ近づく可能性があります。" },
      { label: "現在 15:00", risk: "警戒", rain: "42 mm/h", water: "31 cm", move: "能力低下", score: "0.91", series: profile.series, forecast: [0.94, 0.98, 1.03], summary: "24時間先まで警戒域が継続する予測です。", result: profile.report },
      { label: "現在 16:00", risk: "警戒", rain: "36 mm/h", water: "34 cm", move: "能力低下", score: "0.94", series: [0.2, 0.24, 0.31, 0.41, 0.55, 0.68, 0.78, 0.88, 0.94], forecast: [0.99, 1.04, 1.08], summary: "冠水水位が上がり、予測レンジの上限が警戒基準を超えています。", result: "路面水位と雨量が同時に上昇しています。通行注意通知と現地確認を推奨します。" }
    ];
  }
  if (isRiver) {
    return [
      { label: "現在 14:00", risk: "正常", rain: "18 mm/h", water: "+0.22 m", move: "0.08 m/h", score: "0.48", series: [0.2, 0.22, 0.24, 0.28, 0.33, 0.38, 0.42, 0.45, 0.48], forecast: [0.54, 0.61, 0.68], summary: "水位は上昇中ですが、現時点では注意ライン未満です。", result: "現在値は正常範囲です。雨量が継続する場合、12時間後に注意域へ近づきます。" },
      { label: "現在 15:00", risk: "注意", rain: "30 mm/h", water: "+0.48 m", move: "0.18 m/h", score: "0.74", series: profile.series, forecast: [0.78, 0.83, 0.88], summary: "6時間先に注意ラインへ到達する予測です。", result: profile.report },
      { label: "現在 16:00", risk: "注意", rain: "26 mm/h", water: "+0.56 m", move: "0.21 m/h", score: "0.79", series: [0.22, 0.26, 0.31, 0.4, 0.49, 0.58, 0.66, 0.73, 0.79], forecast: [0.84, 0.9, 0.95], summary: "上昇速度が増え、予測レンジの上限が警戒基準へ近づいています。", result: "水位上昇速度が増えています。巡視判断の準備と監視頻度の引き上げを推奨します。" }
    ];
  }
  return [
    { label: "現在 14:00", risk: "注意", rain: "28 mm/h", water: "+0.41 m", move: "0.7 mm/h", score: "0.64", series: [0.18, 0.21, 0.23, 0.28, 0.36, 0.44, 0.52, 0.58, 0.64], forecast: [0.68, 0.72, 0.76], summary: "地下水位が上昇中です。6時間後に注意域へ到達する可能性があります。", result: "現在値では注意域です。降雨が継続する場合、6から12時間後に警戒域へ近づく可能性があります。" },
    { label: "現在 15:00", risk: "警戒", rain: "42 mm/h", water: "+0.62 m", move: "1.2 mm/h", score: "0.87", series: profile.series, forecast: [0.91, 0.96, 1.02], summary: "現在値から24時間先まで警戒域が継続する予測です。", result: profile.report },
    { label: "現在 16:00", risk: "警戒", rain: "36 mm/h", water: "+0.74 m", move: "1.5 mm/h", score: "0.92", series: [0.2, 0.24, 0.28, 0.37, 0.49, 0.61, 0.73, 0.85, 0.92], forecast: [0.98, 1.04, 1.08], summary: "変位速度が上昇し、予測レンジの上限が警戒基準を超えています。", result: "地下水位と変位速度が同時に上昇しています。現地確認と監視頻度の引き上げを推奨します。" }
  ];
}

function generatedJs(project) {
  const templateId = selectedTemplates(project.selectedTemplateIds)[0]?.id || "slope-monitoring";
  let profile = specializedProfile(templateId);
  if (profile.mode === "timeseries") profile = { ...profile, ...timeseriesVariant(project) };
  const blueprint = generativeBlueprint(project);
  const isTimeseries = profile.mode === "timeseries";
  const frameStates = imageFrameStates(templateId, profile);
  const resultTitle = templateId === "river-monitoring"
    ? "通行注意通知文"
    : templateId === "inspection-damage"
      ? "点検報告コメント"
      : templateId === "timeseries-anomaly"
        ? "予測アラート文"
        : "点検依頼文";
  return `const projectTitle = ${JSON.stringify(project.title)};
const isSpecialized = ${JSON.stringify(project.aiType === "specialized")};
const isTimeseries = ${JSON.stringify(isTimeseries)};
const specializedResultTitle = ${JSON.stringify(resultTitle)};
const latestImprovement = ${JSON.stringify(latestImprovement(project)?.prompt || "")};
const specializedReport = ${JSON.stringify(profile.report)};
const profileFrames = ${JSON.stringify(profile.frames)};
const profileMetrics = ${JSON.stringify(profile.metrics)};
const imageStates = ${JSON.stringify(frameStates)};
const baseSeries = ${JSON.stringify(profile.series)};
const threshold = ${JSON.stringify(profile.threshold)};
const generativePrimary = ${JSON.stringify(blueprint.primaryOutput)};
const generativeOutputs = ${JSON.stringify(blueprint.outputs)};
const generativeTable = ${JSON.stringify(blueprint.table)};
const escapeHtml = (value) => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

let tick = 0;
const timeseriesStates = ${JSON.stringify(timeseriesAnimationStates(profile))};

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function updateRisk(value) {
  setText("riskLevel", value);
  const card = document.getElementById("riskCard");
  if (!card) return;
  card.classList.toggle("alert", value === "警戒");
  card.classList.toggle("watch", value === "注意");
}

function updateResult(title, text) {
  const result = document.getElementById("demoResult");
  if (!result) return;
  result.innerHTML = "<h3>" + escapeHtml(title) + "</h3><p>" + escapeHtml(text) + "</p>" + (latestImprovement ? "<p>改良反映: " + escapeHtml(latestImprovement) + "</p>" : "");
}

function regionPath(region) {
  const x = Number(region.x) || 0;
  const y = Number(region.y) || 0;
  const w = Number(region.w) || 16;
  const h = Number(region.h) || 16;
  const points = [
    [x + w * 0.08, y + h * 0.72],
    [x + w * 0.2, y + h * 0.24],
    [x + w * 0.54, y + h * 0.04],
    [x + w * 0.92, y + h * 0.3],
    [x + w * 0.98, y + h * 0.66],
    [x + w * 0.7, y + h * 0.96],
    [x + w * 0.28, y + h * 0.9]
  ];
  return points.map((point, index) => (index === 0 ? "M " : "L ") + point[0].toFixed(2) + " " + point[1].toFixed(2)).join(" ") + " Z";
}

function renderOverlay(regions) {
  const overlay = document.getElementById("aiOverlay");
  if (!overlay) return;
  overlay.innerHTML = "<svg class='segmentation-overlay' viewBox='0 0 100 100' preserveAspectRatio='none'>" + (regions || []).map((region) => {
    const d = region.path || regionPath(region);
    const x = Math.max(3, Math.min(88, Number(region.x || 0) + 2));
    const y = Math.max(8, Math.min(92, Number(region.y || 0) + 7));
    const isLine = region.kind === "line";
    const klass = isLine ? "seg-line" : (region.muted ? "seg-region muted" : "seg-region");
    const edge = isLine ? "seg-line-edge" : "seg-edge";
    return "<path class='" + klass + "' d='" + d + "'></path><path class='" + edge + "' d='" + d + "'></path><text class='seg-label' x='" + x.toFixed(1) + "' y='" + y.toFixed(1) + "'>" + escapeHtml(region.label) + "</text>";
  }).join("") + "</svg>";
}

function renderPredictionChart(state) {
  const svg = document.getElementById("livePredictionChart");
  if (!svg) return;
  const values = state.series || baseSeries;
  const forecast = state.forecast || [];
  const all = values.concat(forecast);
  const width = 640;
  const height = 260;
  const pad = 38;
  const max = Math.max(threshold, ...all) * 1.12;
  const min = 0;
  const xStep = (width - pad * 2) / (all.length - 1);
  const y = (v) => height - pad - ((v - min) / (max - min || 1)) * (height - pad * 2);
  const point = (v, i) => (pad + xStep * i).toFixed(1) + "," + y(v).toFixed(1);
  const observed = values.map(point).join(" ");
  const predicted = [values[values.length - 1]].concat(forecast).map((v, i) => point(v, values.length - 1 + i)).join(" ");
  const bandTop = forecast.map((v, i) => point(v + 0.07, values.length + i)).join(" ");
  const bandBottom = forecast.slice().reverse().map((v, i) => point(Math.max(0, v - 0.07), values.length + forecast.length - 1 - i)).join(" ");
  const thresholdY = y(threshold).toFixed(1);
  svg.innerHTML =
    "<rect x='0' y='0' width='" + width + "' height='" + height + "' rx='10' fill='#f8fbff'/>" +
    "<g stroke='#d6e1ee' stroke-width='1'><line x1='" + pad + "' y1='" + pad + "' x2='" + pad + "' y2='" + (height - pad) + "'/><line x1='" + pad + "' y1='" + (height - pad) + "' x2='" + (width - pad) + "' y2='" + (height - pad) + "'/><line x1='" + pad + "' y1='" + thresholdY + "' x2='" + (width - pad) + "' y2='" + thresholdY + "' stroke='#d98a1d' stroke-dasharray='6 6'/></g>" +
    "<polygon points='" + bandTop + " " + bandBottom + "' fill='rgba(217,138,29,0.18)'/>" +
    "<polyline points='" + observed + "' fill='none' stroke='#1d63b7' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'/>" +
    "<polyline points='" + predicted + "' fill='none' stroke='#d98a1d' stroke-width='4' stroke-dasharray='7 6' stroke-linecap='round' stroke-linejoin='round'/>" +
    all.map((v, i) => "<circle cx='" + (pad + xStep * i).toFixed(1) + "' cy='" + y(v).toFixed(1) + "' r='" + (i >= values.length ? 7 : 4) + "' fill='" + (i >= values.length ? "#d98a1d" : "#1d63b7") + "' opacity='" + (i >= values.length ? "0.78" : "1") + "'/>").join("") +
    "<text x='" + (width - pad - 110) + "' y='" + (Number(thresholdY) - 8) + "' fill='#875813' font-size='12' font-weight='800'>警戒しきい値</text>" +
    "<text x='" + (width - pad - 112) + "' y='30' fill='#0b3d78' font-size='13' font-weight='900'>実線: 実測 / 点線: 予測</text>";
}

function updateSpecialized() {
  if (!isSpecialized) return;
  if (isTimeseries) {
    const state = timeseriesStates[tick % timeseriesStates.length];
    setText("liveFrameLabel", state.label);
    setText("liveRain", state.rain);
    setText("liveWater", state.water);
    setText("liveMove", state.move);
    setText("liveScore", state.score);
    setText("metricValue0", state.score);
    setText("metricNote0", state.risk + "域");
    setText("metricValue1", state.water);
    setText("metricValue2", state.move);
    setText("liveSummary", state.summary);
    updateRisk(state.risk);
    renderPredictionChart(state);
    updateResult("予測アラート文", state.result);
    tick += 1;
    return;
  }
  const state = imageStates[tick % imageStates.length];
  const image = document.getElementById("liveImage");
  if (image && image.getAttribute("src") !== state.image) image.setAttribute("src", state.image);
  setText("liveFrameLabel", state.frame);
  state.metrics.forEach((row, index) => {
    setText("metricValue" + index, row.length > 2 ? row[1] : row[0]);
    setText("metricNote" + index, row.length > 2 ? row[2] : row[1]);
  });
  renderOverlay(state.regions);
  document.querySelectorAll(".thumb-row span").forEach((el, index) => {
    el.classList.toggle("active", index === state.frameIndex);
  });
  updateRisk(state.risk);
  updateResult(specializedResultTitle, state.result);
  tick += 1;
}

if (isSpecialized) {
  updateSpecialized();
  setInterval(updateSpecialized, 3800);
}

document.getElementById("runDemoBtn")?.addEventListener("click", () => {
  if (isSpecialized) {
    updateSpecialized();
    return;
  }
  const result = document.getElementById("demoResult");
  if (!result) return;
  const prompt = document.getElementById("demoPrompt")?.value || "";
  const cards = generativeOutputs.map((item) => "<span>" + escapeHtml(item) + "</span>").join("");
  const rows = generativeTable.map((row) => "<tr>" + row.map((cell) => "<td>" + escapeHtml(cell) + "</td>").join("") + "</tr>").join("");
  result.innerHTML = "<h3>" + escapeHtml(projectTitle) + "</h3><p class='draft-text'>" + escapeHtml(generativePrimary) + "</p><p>入力要約: " + escapeHtml(prompt.slice(0, 90) || "入力資料") + "</p><div class='output-cards'>" + cards + "</div><table><tbody>" + rows + "</tbody></table>" + (latestImprovement ? "<p class='improvement-note'>改良反映: " + escapeHtml(latestImprovement) + "</p>" : "");
});`;
}

async function writeGeneratedApp(project) {
  const appDir = path.join(GENERATED_DIR, project.id);
  await fsp.mkdir(appDir, { recursive: true });
  await fsp.writeFile(path.join(appDir, "index.html"), generatedIndex(project), "utf8");
  await fsp.writeFile(path.join(appDir, "app.css"), generatedCss(project), "utf8");
  await fsp.writeFile(path.join(appDir, "app.js"), generatedJs(project), "utf8");
  await fsp.writeFile(path.join(appDir, "prompt.md"), buildPrompt(project), "utf8");
  return appDir;
}

async function runCodexIfAvailable(project, appDir) {
  if (!CODEX_ENABLED) {
    await appendLog(project, "ローカル生成モードでアプリを作成しました。外部の有料APIは使用していません。");
    return;
  }
  const hasImprovement = Array.isArray(project.improvementHistory) && project.improvementHistory.length > 0;
  if (!hasImprovement && !CODEX_ON_CREATE) {
    await appendLog(project, "初回作成はローカル生成モードで完了しました。AIによる改良は改良時に実行します。");
    return;
  }
  if (hasImprovement && !CODEX_ON_IMPROVE) {
    await appendLog(project, "改良もローカル生成モードで反映しました。外部の開発AIは使用していません。");
    return;
  }
  if (!commandExists("codex")) {
    if (!CODEX_EXTERNAL) {
      await appendLog(project, "開発AIを起動できないため、ローカル生成のデモアプリを表示します。");
      return;
    }
  }

  await appendLog(project, hasImprovement ? "AIで改良指示を反映します。" : "AIでアプリ作成指示を反映します。");
  if (CODEX_EXTERNAL) {
    await runExternalCodex(project, appDir);
    return;
  }
  await appendLog(project, "codex execを起動しました。ファイル差分を作成しています。");
  const codexHome = await prepareCodexHome(appDir);
  const prompt = await fsp.readFile(path.join(appDir, "prompt.md"), "utf8");
  const codexArgs = [
    "exec",
    "--sandbox",
    "workspace-write",
    "--skip-git-repo-check",
    "--json",
    "--output-last-message",
    path.join(appDir, "codex-summary.md")
  ];
  if (CODEX_MODEL) codexArgs.push("-m", CODEX_MODEL);
  codexArgs.push("-");
  try {
    await new Promise((resolve) => {
      const child = spawn("codex", codexArgs, {
        cwd: appDir,
        env: {
          ...process.env,
          CODEX_HOME: codexHome
        }
      });

      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          child.kill("SIGTERM");
          appendLog(project, "Codex実行がタイムアウトしたため停止しました。既存の疑似アプリを使用します。").then(resolve);
          settled = true;
        }
      }, CODEX_TIMEOUT_MS);

      child.stdin.on("error", () => {});
      child.stdin.end(prompt);

      child.stdout.on("data", (chunk) => {
        const text = chunk.toString("utf8").trim();
        if (text) {
          text.split(/\r?\n/).filter(Boolean).slice(0, 8).forEach((line) => {
            appendLog(project, `codex: ${line.slice(0, 1000)}`);
          });
        }
      });
      child.stderr.on("data", (chunk) => {
        const text = chunk.toString("utf8").trim();
        if (text) {
          text.split(/\r?\n/).filter(Boolean).slice(0, 8).forEach((line) => {
            appendLog(project, `codex err: ${line.slice(0, 1000)}`);
          });
        }
      });
      child.on("close", (code) => {
        if (settled) return;
        clearTimeout(timer);
        settled = true;
        const message = code === 0
          ? "開発AIの反映が完了しました。"
          : `開発AIが終了しました。exit=${code}。ローカル生成結果を表示します。`;
        appendLog(project, message).then(resolve);
      });
    });
  } finally {
    await fsp.rm(codexHome, { recursive: true, force: true }).catch(() => {});
  }
}

async function runExternalCodex(project, appDir) {
  const requestFile = path.join(CODEX_REQUESTS_DIR, `${project.id}.json`);
  const resultFile = path.join(CODEX_RESULTS_DIR, `${project.id}.json`);
  const logFile = path.join(CODEX_LOGS_DIR, `${project.id}.log`);
  await fsp.rm(resultFile, { force: true }).catch(() => {});
  await fsp.rm(logFile, { force: true }).catch(() => {});
  await fsp.writeFile(requestFile, JSON.stringify({
    projectId: project.id,
    requestedAt: new Date().toISOString(),
    appPath: path.relative(DATA_DIR, appDir),
    promptFile: "prompt.md"
  }, null, 2), "utf8");
  await appendLog(project, "AI開発ワーカーに作業を依頼しました。");
  await appendLog(project, "ワーカーが解析エンジンとUIの改良を開始します。");

  const started = Date.now();
  while (Date.now() - started < CODEX_TIMEOUT_MS) {
    const result = await readJsonFile(resultFile, null);
    if (result) {
      if (result.ok) {
        await appendLog(project, "AI開発ワーカーの反映が完了しました。");
      } else {
        await appendLog(project, `AI開発ワーカーが完了できませんでした。${result.message || "ローカル生成結果を表示します。"}`);
      }
      return;
    }
    await sleep(1200);
  }

  await appendLog(project, "AI開発ワーカーの処理が長くなっているため、現在の生成結果を先に表示します。");
}

async function runProjectJob(projectId) {
  let project = await loadProjectRaw(projectId);
  project.status = "generating";
  project.updatedAt = new Date().toISOString();
  await saveProject(project);
  jobs.set(projectId, project.status);

  try {
    const hasImprovement = Array.isArray(project.improvementHistory) && project.improvementHistory.length > 0;
    await appendLog(project, hasImprovement ? "改良プロンプトを受信しました。" : "作成プロンプトを受信しました。");
    await appendLog(project, hasImprovement ? "改良用のアプリを準備しています。" : "プロジェクトを作成しました。生成用テンプレートを準備しています。");
    const appDir = await writeGeneratedApp(project);
    await appendLog(project, "index.html / app.css / app.js を生成しました。");
    await appendLog(project, "AIに渡すプロンプトを組み立てました。");
    await runCodexIfAvailable(project, appDir);
    project = await loadProjectRaw(projectId);
    await appendLog(project, "生成ファイルを確認し、デモURLへ反映しています。");
    project = await loadProjectRaw(projectId);
    project.status = "ready";
    project.previewUrl = `/archive/${project.id}/`;
    project.updatedAt = new Date().toISOString();
    await appendLog(project, "デモ画面を公開しました。");
    await saveProject(project);
    jobs.set(projectId, project.status);
  } catch (error) {
    project = await loadProjectRaw(projectId).catch(() => project);
    project.status = "error";
    project.error = error.message;
    project.updatedAt = new Date().toISOString();
    project.logs.push(`[${new Date().toISOString()}] error: ${error.stack || error.message}`);
    await saveProject(project);
    jobs.set(projectId, project.status);
  }
}

async function listProjects() {
  await ensureDirs();
  const dirs = await fsp.readdir(PROJECTS_DIR, { withFileTypes: true }).catch(() => []);
  const projects = [];
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    try {
      projects.push(await loadProject(dir.name));
    } catch {
      // Ignore partial project records.
    }
  }
  return projects.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function handleCreateProject(req, res, session) {
  const body = await readBody(req);
  const { fields, files } = parseMultipart(body, req.headers["content-type"]);
  const rawIds = fields.selectedTemplateIds ? JSON.parse(fields.selectedTemplateIds) : [];
  const chosen = selectedTemplates(rawIds);
  const id = `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${crypto.randomBytes(4).toString("hex")}`;
  const uploadDir = path.join(UPLOADS_DIR, id);
  await fsp.mkdir(uploadDir, { recursive: true });
  const savedFiles = [];
  for (const file of files.slice(0, 12)) {
    const name = safeName(file.filename || "upload.bin");
    const diskName = `${crypto.randomBytes(3).toString("hex")}-${name}`;
    const dest = path.join(uploadDir, diskName);
    await fsp.writeFile(dest, file.content);
    savedFiles.push({
      originalName: file.filename || name,
      diskName,
      contentType: file.contentType,
      size: file.content.length,
      preview: textPreview(file.content, file.filename)
    });
  }

  const project = {
    id,
    owner: session.user,
    title: defaultTitle(fields, chosen),
    aiType: fields.aiType === "specialized" ? "specialized" : "generative",
    selectedTemplateIds: rawIds,
    instruction: (fields.instruction || "").trim(),
    dataMode: fields.dataMode === "upload" ? "upload" : "default",
    timeseriesDataset: ["slope", "river", "road"].includes(fields.timeseriesDataset) ? fields.timeseriesDataset : "slope",
    timeseriesGoal: ["anomaly", "forecast"].includes(fields.timeseriesGoal) ? fields.timeseriesGoal : "forecast",
    inputDescription: (fields.inputDescription || "").trim(),
    outputDescription: (fields.outputDescription || "").trim(),
    files: savedFiles,
    status: "queued",
    previewUrl: null,
    error: null,
    logs: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await saveProject(project);
  setTimeout(() => runProjectJob(id), 50);
  sendJson(res, 201, { project });
}

async function handleImproveProject(req, res, projectId) {
  const body = await readBody(req, 1024 * 1024);
  const payload = JSON.parse(body.toString("utf8") || "{}");
  const prompt = String(payload.prompt || "").trim();
  const target = ["screen", "prompt", "output", "data"].includes(payload.target) ? payload.target : "screen";
  if (!prompt) {
    sendJson(res, 400, { error: "missing_prompt" });
    return;
  }

  const project = await loadProjectRaw(projectId);
  project.improvementHistory = Array.isArray(project.improvementHistory) ? project.improvementHistory : [];
  project.improvementHistory.push({
    target,
    prompt: prompt.slice(0, 4000),
    createdAt: new Date().toISOString()
  });
  project.status = "queued";
  project.error = null;
  project.updatedAt = new Date().toISOString();
  project.logs = Array.isArray(project.logs) ? project.logs : [];
  project.logs.push(`[${new Date().toISOString()}] ${improvementTargetLabel(target)}の改良指示を受け付けました。`);
  await saveProject(project);
  setTimeout(() => runProjectJob(projectId), 50);
  sendJson(res, 202, { project });
}

async function serveStaticFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = mimeTypes[ext] || "application/octet-stream";
  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) return notFound(res);
    const stream = fs.createReadStream(filePath);
    res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
    stream.pipe(res);
  } catch {
    notFound(res);
  }
}

function setLoginCookie(res, sid) {
  res.setHeader("set-cookie", `oxsid=${encodeURIComponent(sid)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 12}`);
}

async function router(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === "/api/deploy" && req.method === "POST") {
    await handleDeployRequest(req, res, url);
    return;
  }

  if (pathname === "/api/deploy/status" && req.method === "GET") {
    await handleDeployStatus(req, res, url);
    return;
  }

  if (req.method === "POST" && pathname === "/api/login") {
    const body = await readBody(req, 1024 * 1024);
    const contentType = req.headers["content-type"] || "";
    let payload = {};
    if (contentType.includes("application/json")) payload = JSON.parse(body.toString("utf8") || "{}");
    else payload = Object.fromEntries(new URLSearchParams(body.toString("utf8")).entries());
    if (payload.id === AUTH_ID && payload.password === AUTH_PASS) {
      const sid = crypto.randomBytes(24).toString("hex");
      sessions.set(sid, { user: payload.id, createdAt: Date.now() });
      setLoginCookie(res, sid);
      sendJson(res, 200, { ok: true, user: payload.id });
      return;
    }
    sendJson(res, 401, { error: "invalid_credentials" });
    return;
  }

  if (req.method === "POST" && pathname === "/api/logout") {
    const sid = parseCookies(req).oxsid;
    if (sid) sessions.delete(sid);
    res.setHeader("set-cookie", "oxsid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && pathname.startsWith("/archive/")) {
    const parts = pathname.split("/").filter(Boolean);
    const id = parts[1];
    const rest = parts.slice(2).join("/") || "index.html";
    if (!/^[\w-]+$/.test(id || "")) return notFound(res);
    const appDir = path.join(GENERATED_DIR, id);
    const filePath = path.resolve(appDir, rest);
    if (!filePath.startsWith(path.resolve(appDir))) return notFound(res);
    await serveStaticFile(res, filePath);
    return;
  }

  if (req.method === "GET" && pathname === "/api/me") {
    const session = getSession(req);
    sendJson(res, 200, { authenticated: Boolean(session), user: session?.user || null });
    return;
  }

  if (pathname.startsWith("/api/")) {
    const session = requireSession(req, res);
    if (!session) return;

    if (req.method === "GET" && pathname === "/api/templates") {
      sendJson(res, 200, { templates: specializedTemplates });
      return;
    }
    if (req.method === "GET" && pathname === "/api/projects") {
      sendJson(res, 200, { projects: await listProjects() });
      return;
    }
    if (req.method === "POST" && pathname === "/api/projects") {
      await handleCreateProject(req, res, session);
      return;
    }
    const improveMatch = /^\/api\/projects\/([\w-]+)\/improve$/.exec(pathname);
    if (improveMatch && req.method === "POST") {
      try {
        await handleImproveProject(req, res, improveMatch[1]);
      } catch {
        notFound(res);
      }
      return;
    }
    const projectMatch = /^\/api\/projects\/([\w-]+)$/.exec(pathname);
    if (projectMatch && req.method === "DELETE") {
      try {
        await deleteProject(projectMatch[1]);
        sendJson(res, 200, { ok: true });
      } catch {
        notFound(res);
      }
      return;
    }
    if (projectMatch && req.method === "GET") {
      try {
        sendJson(res, 200, { project: await loadProject(projectMatch[1]) });
      } catch {
        notFound(res);
      }
      return;
    }
    notFound(res);
    return;
  }

  if (req.method === "GET") {
    const publicPath = pathname === "/" ? "/index.html" : pathname;
    const filePath = path.resolve(PUBLIC_DIR, "." + publicPath);
    if (!filePath.startsWith(path.resolve(PUBLIC_DIR))) return notFound(res);
    await serveStaticFile(res, filePath);
    return;
  }

  notFound(res);
}

async function main() {
  await ensureDirs();
  const server = http.createServer((req, res) => {
    router(req, res).catch((error) => {
      console.error(error);
      sendJson(res, 500, { error: "internal_error", message: error.message });
    });
  });
  server.listen(PORT, HOST, () => {
    console.log(`OX AI Workshop Builder listening on http://${HOST}:${PORT}`);
    console.log(`Codex enabled: ${CODEX_ENABLED}`);
    console.log(`Codex on create: ${CODEX_ON_CREATE}, on improve: ${CODEX_ON_IMPROVE}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
