const app = document.getElementById("app");

let state = {
  me: null,
  view: "builder",
  aiType: "specialized",
  builderStage: "select",
  templates: [],
  projects: [],
  selectedTemplates: new Set(["slope-monitoring"]),
  activeProjectId: null,
  keepImproveOpen: false,
  improveTarget: "screen",
  specializedStep: 1,
  annotationBoxes: {},
  annotationBrush: 22,
  annotationAccepted: {},
  maskAdjustment: {},
  sampleFrame: {},
  tsDataset: "slope",
  tsGoal: "forecast",
  tsThreshold: 72,
  tsSensitivity: 66,
  polling: null
};

const statusLabel = {
  queued: "待機中",
  generating: "生成中",
  ready: "完成",
  error: "エラー"
};

const generativeExamples = [
  {
    label: "業務計画書",
    prompt: "特記仕様書、過去の業務計画書、現場条件メモを入力すると、業務条件を抽出し、業務計画書の章立て、実施方針、工程、実施体制、照査ポイント、顧客確認事項を1画面で生成する業務アプリ。左に入力資料、中央に抽出条件、右に計画書ドラフトと確認事項を表示し、Wordに貼り付けやすい文章で出力する。"
  },
  {
    label: "議事録ToDo",
    prompt: "会議メモ、音声文字起こし、配布資料を入力すると、議題別の要点、決定事項、担当者別ToDo、期限、未確認事項、次回確認メールを生成するアプリ。発言メモをそのまま貼っても、業務で使える議事録形式に整え、抜け漏れがある項目は確認リストとして分けて表示する。"
  },
  {
    label: "点検報告書",
    prompt: "点検写真メモ、損傷位置、過年度コメントを入力すると、損傷区分、写真台帳コメント、健全性の所見、補修要否、報告書本文の下書き、不足確認事項を生成するアプリ。入力欄、写真メモ一覧、AI所見、報告書ドラフト、確認チェックリストを1画面で扱えるようにする。"
  },
  {
    label: "提案書",
    prompt: "顧客からの相談内容、対象現場、保有データ、制約条件を入力すると、課題整理、AI活用方針、PoC案、必要データ、概算スケジュール、体制、提案メール文面を生成するアプリ。営業担当がその場で提案骨子を確認し、社内相談に回せる粒度で出力する。"
  },
  {
    label: "自由記述",
    prompt: "入力ファイルやテキストを受け取り、必要な処理を行い、業務でそのまま使える成果物を出力するアプリ。入力、処理、出力、確認事項が1画面で分かるようにし、利用者が追加指示で改善できる構成にする。"
  }
];

function html(strings, ...values) {
  return strings.reduce((out, item, index) => out + item + (values[index] ?? ""), "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: options.body instanceof FormData ? options.headers : {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || "request_failed");
  return data;
}

async function init() {
  const me = await api("/api/me");
  state.me = me;
  const archiveMatch = /^#archive:?([^/]*)?/.exec(location.hash);
  state.view = archiveMatch ? "archive" : "builder";
  if (archiveMatch?.[1]) state.activeProjectId = archiveMatch[1];
  if (!me.authenticated) {
    renderLogin();
    return;
  }
  await loadWorkspace();
  renderApp();
}

function renderLogin() {
  app.innerHTML = html`
    <section class="login-screen">
      <div class="login-copy">
        <p class="eyebrow">OX AI Builder</p>
        <h1>OX AI Builder<br><span>AI 体験アプリ</span></h1>
      </div>
      <div class="login-panel">
        <form class="login-card" id="loginForm">
          <p class="eyebrow">ログイン</p>
          <label class="field">
            <span>ID</span>
            <input name="id" autocomplete="username">
          </label>
          <label class="field">
            <span>Password</span>
            <input name="password" type="password" autocomplete="current-password">
          </label>
          <p class="error" id="loginError"></p>
          <button type="submit">ログイン</button>
        </form>
      </div>
    </section>`;

  document.getElementById("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/login", {
        method: "POST",
        body: JSON.stringify({
          id: form.get("id"),
          password: form.get("password")
        })
      });
      await loadWorkspace();
      renderApp();
    } catch {
      document.getElementById("loginError").textContent = "IDまたはパスワードが違います。";
    }
  });
}

async function loadWorkspace() {
  const [templates, projects] = await Promise.all([
    api("/api/templates"),
    api("/api/projects")
  ]);
  state.templates = templates.templates;
  state.projects = projects.projects;
}

function renderApp() {
  app.innerHTML = html`
    <section class="app-shell">
      <nav class="top-nav">
        <button class="brand brand-button" type="button" data-view="builder">
          <div class="mark">OX</div>
          <div>
            <strong>OX AI Builder</strong>
            <span>AI 体験アプリ</span>
          </div>
        </button>
        <div class="nav-tabs">
          ${tabButton("builder", "アプリを作る")}
          ${tabButton("archive", "作ったアプリ")}
        </div>
        <button class="ghost" id="logoutBtn">ログアウト</button>
      </nav>
      <div class="shell" id="view"></div>
    </section>`;

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST", body: "{}" });
    renderLogin();
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      history.replaceState(null, "", state.view === "archive" ? "#archive" : "#builder");
      renderApp();
    });
  });
  renderCurrentView();
}

function tabButton(id, label) {
  return `<button data-view="${id}" class="${state.view === id ? "active" : ""}">${label}</button>`;
}

function renderCurrentView() {
  const view = document.getElementById("view");
  if (state.view === "archive") return renderArchive(view);
  renderBuilder(view);
}

function renderBuilder(container) {
  const configure = state.builderStage === "configure";
  if (!configure) {
    container.innerHTML = html`
      <header class="page-head compact-head">
        <div>
          <p class="eyebrow">アプリ作成</p>
          <h1>AIアプリ開発 (デモ版)</h1>
        </div>
      </header>

      <section class="mode-picker">
        <button class="mode-card" type="button" data-ai-type="specialized">
          <span>画像・センサー・点検</span>
          <h2>特化型AI開発</h2>
          <p>類型を選び、データ確認から完成デモまで進めます。</p>
        </button>
        <button class="mode-card" type="button" data-ai-type="generative">
          <span>文書作成・要約・照査</span>
          <h2>生成AI活用</h2>
          <p>指示文から、すぐ試せる業務アプリを作ります。</p>
        </button>
      </section>`;
    document.querySelectorAll("[data-ai-type]").forEach((button) => {
      button.addEventListener("click", () => {
        state.aiType = button.dataset.aiType;
        state.builderStage = "configure";
        if (state.aiType === "specialized" && state.selectedTemplates.size === 0) {
          state.selectedTemplates.add("slope-monitoring");
        }
        renderApp();
      });
    });
    return;
  }

  container.innerHTML = html`
    <header class="page-head">
      <div>
        <p class="eyebrow">アプリ作成</p>
        <h1>${state.aiType === "specialized" ? "特化型AI開発" : "生成AI活用"}</h1>
      </div>
      <button type="button" class="secondary" data-builder-back>戻る</button>
    </header>

    <section class="builder-grid builder-grid-single">
      <form class="panel" id="projectForm">
        ${state.aiType === "specialized" ? specializedForm() : generativeForm()}
        <div class="actions">
          <button type="submit" id="submitBtn" ${state.aiType === "specialized" && state.specializedStep < 4 ? "disabled" : ""}>${state.aiType === "specialized" ? "完成アプリを生成" : "完成画面を生成"}</button>
        </div>
        <div id="jobArea"></div>
      </form>
    </section>`;
  document.querySelectorAll("[data-builder-back]").forEach((button) => {
    button.addEventListener("click", () => {
      state.builderStage = "select";
      renderApp();
    });
  });
  document.querySelectorAll("[data-template]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      state.selectedTemplates.clear();
      state.selectedTemplates.add(checkbox.value);
      state.annotationBrush = checkbox.value === "inspection-damage" ? 8 : 22;
      state.specializedStep = 1;
      renderApp();
    });
  });
  document.querySelectorAll("[data-flow-step]").forEach((button) => {
    button.addEventListener("click", () => {
      state.specializedStep = Number(button.dataset.flowStep) || 1;
      renderApp();
    });
  });
  document.querySelectorAll("[data-advance-flow]").forEach((button) => {
    button.addEventListener("click", () => {
      state.specializedStep = Math.min(4, state.specializedStep + 1);
      renderApp();
    });
  });
  document.querySelectorAll("[data-timeseries-control]").forEach((input) => {
    input.addEventListener("input", () => {
      if (input.dataset.timeseriesControl === "threshold") state.tsThreshold = Number(input.value);
      if (input.dataset.timeseriesControl === "sensitivity") state.tsSensitivity = Number(input.value);
      renderApp();
    });
  });
  document.querySelectorAll("[data-ts-dataset]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tsDataset = button.dataset.tsDataset;
      renderApp();
    });
  });
  document.querySelectorAll("[data-ts-goal]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tsGoal = button.dataset.tsGoal;
      renderApp();
    });
  });
  document.querySelectorAll("[data-sample-frame]").forEach((button) => {
    button.addEventListener("click", () => {
      state.sampleFrame[button.dataset.sampleTemplate] = Number(button.dataset.sampleFrame) || 0;
      renderApp();
    });
  });
  document.querySelectorAll("[data-annotation-undo]").forEach((button) => {
    button.addEventListener("click", () => {
      const templateId = button.dataset.annotationUndo;
      const boxes = state.annotationBoxes[templateId] || [];
      state.annotationBoxes[templateId] = boxes.slice(0, -1);
      renderApp();
    });
  });
  document.querySelectorAll("[data-annotation-clear]").forEach((button) => {
    button.addEventListener("click", () => {
      const templateId = button.dataset.annotationClear;
      state.annotationBoxes[templateId] = [];
      state.annotationAccepted[templateId] = false;
      state.maskAdjustment[templateId] = 0;
      renderApp();
    });
  });
  document.querySelectorAll("[data-adopt-mask]").forEach((button) => {
    button.addEventListener("click", () => {
      state.annotationAccepted[button.dataset.adoptMask] = true;
      renderApp();
    });
  });
  document.querySelectorAll("[data-mask-adjust]").forEach((input) => {
    input.addEventListener("input", () => {
      state.maskAdjustment[input.dataset.maskAdjust] = Number(input.value);
      state.annotationAccepted[input.dataset.maskAdjust] = true;
      renderApp();
    });
  });
  document.querySelectorAll("[data-annotation-brush]").forEach((input) => {
    input.addEventListener("input", () => {
      state.annotationBrush = Number(input.value);
      renderApp();
    });
  });
  wireAnnotationCanvas();
  document.querySelectorAll("[data-example]").forEach((button) => {
    button.addEventListener("click", () => {
      const prompt = document.querySelector(".big-prompt");
      if (prompt) prompt.value = button.dataset.example || "";
      document.querySelectorAll("[data-example]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
    });
  });
  document.querySelectorAll(".drop-zone").forEach((zone) => {
    const input = zone.querySelector("input[type='file']");
    const label = zone.querySelector("[data-file-label]");
    const updateLabel = () => {
      const count = input?.files?.length || 0;
      if (label) label.textContent = count ? `${count}件のファイルを追加済み` : "ここにドラッグ、またはクリックして選択";
    };
    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      zone.classList.add("dragging");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("dragging"));
    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      zone.classList.remove("dragging");
      if (input && event.dataTransfer?.files?.length) {
        input.files = event.dataTransfer.files;
        updateLabel();
      }
    });
    input?.addEventListener("change", updateLabel);
  });
  document.getElementById("projectForm").addEventListener("submit", submitProject);
}

function wireAnnotationCanvas() {
  const canvas = document.querySelector("[data-annotation-canvas]");
  if (!canvas) return;
  const templateId = canvas.dataset.annotationCanvas;
  const areaMode = templateId !== "inspection-damage";
  let stroke = null;
  let draftPath = null;
  const toPoint = (event) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100))
    };
  };
  const ensureDraftPath = () => {
    if (draftPath) return draftPath;
    let svg = canvas.querySelector(".annotation-draft-svg");
    if (!svg) {
      svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "annotation-svg annotation-draft-svg");
      svg.setAttribute("viewBox", "0 0 100 100");
      svg.setAttribute("preserveAspectRatio", "none");
      canvas.appendChild(svg);
    }
    draftPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    draftPath.setAttribute("class", "annotation-stroke draft");
    svg.appendChild(draftPath);
    return draftPath;
  };
  const appendPoint = (point) => {
    if (!stroke) return;
    const last = stroke.points[stroke.points.length - 1];
    const distance = Math.hypot(point.x - last.x, point.y - last.y);
    if (distance < 0.9) return;
    stroke.points.push(point);
    const path = ensureDraftPath();
    path.setAttribute("d", pathFromPoints(stroke.points));
    path.setAttribute("stroke-width", brushWidthForSvg(stroke.width));
  };
  canvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    stroke = {
      type: "brush",
      points: [toPoint(event)],
      width: state.annotationBrush,
      closed: false
    };
    appendPoint({ x: stroke.points[0].x + 0.01, y: stroke.points[0].y + 0.01 });
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!stroke) return;
    appendPoint(toPoint(event));
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!stroke) return;
    appendPoint(toPoint(event));
    stroke.closed = areaMode && stroke.points.length > 3;
    const boxes = state.annotationBoxes[templateId] || [];
    state.annotationBoxes[templateId] = boxes.concat(stroke).slice(-8);
    stroke = null;
    renderApp();
  });
  canvas.addEventListener("pointercancel", () => {
    stroke = null;
    renderApp();
  });
}

function annotationBox(templateId) {
  return (state.annotationBoxes[templateId] || [])[0] || null;
}

function annotationBoxes(templateId) {
  return state.annotationBoxes[templateId] || [];
}

function brushWidthForSvg(width) {
  return Math.max(4, Math.min(20, Number(width || 18) / 2.1));
}

function pathFromPoints(points, closed = false) {
  if (!points || points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} l 0.1 0.1`;
  const d = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  return closed ? `${d} Z` : d;
}

function annotationPathFromLegacyRect(rect) {
  const x = rect.x;
  const y = rect.y;
  const w = rect.w;
  const h = rect.h;
  return [
    `M ${(x + w * 0.08).toFixed(2)} ${(y + h * 0.72).toFixed(2)}`,
    `C ${(x + w * 0.18).toFixed(2)} ${(y + h * 0.24).toFixed(2)}, ${(x + w * 0.55).toFixed(2)} ${(y + h * 0.02).toFixed(2)}, ${(x + w * 0.9).toFixed(2)} ${(y + h * 0.28).toFixed(2)}`,
    `C ${(x + w * 1.04).toFixed(2)} ${(y + h * 0.56).toFixed(2)}, ${(x + w * 0.76).toFixed(2)} ${(y + h * 1.02).toFixed(2)}, ${(x + w * 0.34).toFixed(2)} ${(y + h * 0.94).toFixed(2)}`,
    "Z"
  ].join(" ");
}

function annotationMaskMarkup(strokes, label) {
  if (!strokes.length) return "";
  const masks = strokes.map((stroke, index) => {
    const d = stroke.points ? pathFromPoints(stroke.points, !!stroke.closed) : annotationPathFromLegacyRect(stroke);
    const width = brushWidthForSvg(stroke.width);
    return `
      <path class="${stroke.closed ? "annotation-area-fill" : "annotation-ai-fill"}" d="${d}" stroke-width="${(width + 2).toFixed(1)}"></path>
      <path class="annotation-stroke saved ${stroke.closed ? "area" : ""}" d="${d}" stroke-width="${stroke.closed ? "1.2" : width.toFixed(1)}"></path>
      <path class="annotation-contour ${stroke.closed ? "area" : ""}" d="${d}" stroke-width="${stroke.closed ? "1.4" : Math.max(1.1, width * 0.36).toFixed(1)}"></path>`;
  }).join("");
  return `<svg class="annotation-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${masks}</svg>`;
}

function segmentationPreviewMarkup(templateId, frameIndex = 5, mode = "result") {
  const selected = segmentationPaths(templateId, frameIndex);
  const label = mode === "assist" ? "AI候補" : "AI検知";
  return `<svg class="segmentation-preview" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    ${selected.map((item) => {
      const isLine = item.kind === "line";
      return `
      <path class="${isLine ? "seg-preview-line-mask" : `seg-preview-mask ${item.secondary ? "secondary" : ""}`}" d="${item.d}"></path>
      <path class="${isLine ? "seg-preview-line-edge" : "seg-preview-edge"}" d="${item.d}"></path>
      <text x="${item.x}" y="${item.y}">${escapeHtml(item.label)}</text>
    `;
    }).join("")}
    <text x="7" y="16">${label}</text>
  </svg>`;
}

function annotationStats(templateId) {
  const strokes = annotationBoxes(templateId);
  const pointCount = strokes.reduce((total, stroke) => total + (stroke.points?.length || 5), 0);
  const accepted = strokes.length > 0;
  const coverageBase = {
    "slope-monitoring": 18.4,
    "river-monitoring": 32.8,
    "inspection-damage": 4.6
  }[templateId] || 14.5;
  const coverage = Math.max(1.2, coverageBase + Math.min(pointCount, 110) * 0.035);
  const boundary = Math.min(0.95, 0.84 + (accepted ? 0.06 : 0));
  const score = Math.min(0.96, 0.86 + (accepted ? 0.06 : 0) + Math.min(pointCount, 80) * 0.0008);
  return {
    strokes: strokes.length,
    pointCount,
    accepted,
    coverage,
    boundary,
    score
  };
}

function monitoringSlug(templateId) {
  return {
    "slope-monitoring": "slope",
    "river-monitoring": "flood",
    "inspection-damage": "crack"
  }[templateId] || "flood";
}

function monitoringImage(templateId, index = 0) {
  return `/assets/monitoring/${monitoringSlug(templateId)}/frame-${String(index).padStart(2, "0")}.jpg`;
}

function imageTemplate(templateId) {
  return ["slope-monitoring", "river-monitoring", "inspection-damage"].includes(templateId);
}

function annotationFrameIndex(templateId, step = state.specializedStep) {
  if (!imageTemplate(templateId)) return 0;
  return step <= 1 ? 0 : 5;
}

function segPath(label, d, x, y, secondary = false, kind = "area") {
  return { label, d, x, y, secondary, kind };
}

function segmentationPaths(templateId, frameIndex = 5) {
  if (templateId === "slope-monitoring") {
    const frames = {
      0: [],
      1: [segPath("地すべり", "M 64 31 C 70 33 74 40 73 50 C 71 59 65 66 57 68 C 53 64 54 55 58 47 C 61 41 61 35 64 31 Z", 63, 35)],
      2: [segPath("地すべり", "M 65 28 C 73 31 78 41 76 54 C 74 65 66 73 56 76 C 50 70 52 58 57 48 C 62 39 61 32 65 28 Z", 63, 33)],
      3: [segPath("地すべり", "M 64 26 C 74 29 79 40 78 55 C 76 68 67 76 55 79 C 49 72 51 59 57 48 C 62 39 60 31 64 26 Z", 63, 32)],
      4: [segPath("地すべり", "M 65 24 C 75 28 81 40 79 56 C 77 69 68 78 56 80 C 50 74 51 61 58 49 C 63 40 61 30 65 24 Z", 64, 31)],
      5: [segPath("地すべり", "M 66 25 C 75 28 80 39 79 54 C 77 67 69 76 57 79 C 51 73 52 61 58 50 C 63 41 62 31 66 25 Z", 64, 31)]
    };
    return frames[frameIndex] || frames[5];
  }
  if (templateId === "inspection-damage") {
    const frames = {
      0: [segPath("ひび割れ", "M 10 12 C 23 25 28 39 39 50 C 48 59 55 70 66 84", 21, 24, false, "line")],
      1: [segPath("ひび割れ", "M 54 2 C 53 16 51 27 53 38 C 55 48 51 57 53 68 C 55 80 57 91 56 99 M 52 41 C 42 36 34 31 26 24 M 54 48 C 63 43 70 36 78 29", 50, 13, false, "line")],
      2: [segPath("ひび割れ", "M 9 6 C 18 18 27 29 36 41 C 47 55 59 68 73 86", 18, 18, false, "line")],
      3: [segPath("ひび割れ", "M 1 95 C 14 79 27 62 40 48 C 51 36 62 24 74 9", 17, 74, false, "line")],
      4: [segPath("ひび割れ", "M 54 4 C 52 17 50 31 51 44 C 53 57 50 72 51 87 C 52 94 52 98 52 100", 50, 16, false, "line")],
      5: [segPath("ひび割れ", "M 51 0 C 52 11 51 22 52 34 C 54 47 51 58 53 70 C 54 82 55 93 55 100", 50, 16, false, "line")]
    };
    return frames[frameIndex] || frames[5];
  }
  const flood = {
    0: [segPath("冠水域", "M 0 68 C 16 62 37 65 55 72 C 47 86 31 97 7 100 L 0 100 Z", 8, 74)],
    1: [segPath("冠水域", "M 0 57 C 18 51 39 54 58 64 C 58 80 38 96 4 100 L 0 100 Z", 8, 68)],
    2: [segPath("冠水域", "M 0 50 C 22 45 49 49 74 63 C 77 80 50 97 5 100 L 0 100 Z", 9, 62)],
    3: [segPath("冠水域", "M 0 46 C 23 40 51 42 78 58 C 83 79 58 96 4 100 L 0 100 Z", 9, 57)],
    4: [segPath("冠水域", "M 0 40 C 28 37 58 41 85 57 C 94 77 67 98 4 100 L 0 100 Z", 9, 53)],
    5: [segPath("冠水域", "M 0 35 C 29 31 62 37 92 55 C 100 75 78 96 8 100 L 0 100 Z", 9, 49)]
  };
  return flood[frameIndex] || flood[5];
}

function timeSeriesDecision() {
  const sensitivity = state.tsSensitivity / 100;
  const threshold = state.tsThreshold / 100;
  const latestScore = Math.min(0.98, Math.max(0.2, 0.58 + sensitivity * 0.32));
  const risk = latestScore >= threshold ? "警戒" : latestScore >= threshold - 0.12 ? "注意" : "正常";
  const forecast = [
    latestScore,
    Math.min(0.99, latestScore + 0.05 + sensitivity * 0.04),
    Math.min(1.08, latestScore + 0.1 + sensitivity * 0.08)
  ];
  return { sensitivity, threshold, latestScore, risk, forecast };
}

function miniPredictionSvg(decision) {
  const observed = [0.22, 0.24, 0.29, 0.36, 0.44, 0.52, decision.latestScore];
  const values = observed.concat(decision.forecast.slice(1));
  const width = 560;
  const height = 190;
  const pad = 28;
  const max = Math.max(1.05, ...values);
  const xStep = (width - pad * 2) / (values.length - 1);
  const y = (value) => height - pad - (value / max) * (height - pad * 2);
  const observedPoints = observed.map((value, index) => `${pad + xStep * index},${y(value).toFixed(1)}`).join(" ");
  const forecastPoints = decision.forecast.map((value, index) => `${pad + xStep * (observed.length - 1 + index)},${y(value).toFixed(1)}`).join(" ");
  const thresholdY = y(decision.threshold).toFixed(1);
  return `<svg class="ts-preview-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="予測グラフ">
    <rect width="${width}" height="${height}" rx="10" fill="#f8fbff"></rect>
    <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#c9d8e8"></line>
    <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#c9d8e8"></line>
    <line x1="${pad}" y1="${thresholdY}" x2="${width - pad}" y2="${thresholdY}" stroke="#d98a1d" stroke-dasharray="6 6"></line>
    <polyline points="${observedPoints}" fill="none" stroke="#1d63b7" stroke-width="4" stroke-linecap="round"></polyline>
    <polyline points="${forecastPoints}" fill="none" stroke="#d98a1d" stroke-width="4" stroke-dasharray="7 6" stroke-linecap="round"></polyline>
    <text x="${width - pad - 88}" y="${Number(thresholdY) - 8}" fill="#875813" font-size="12" font-weight="900">しきい値</text>
    <text x="${width - pad - 126}" y="30" fill="#0b3d78" font-size="12" font-weight="900">実線: 実測 / 点線: 予測</text>
  </svg>`;
}

function imageFrameData(templateId, index = 0) {
  const data = {
    "slope-monitoring": [
      { label: "10:00", risk: "正常", values: [12, 0.8, 0.06], metrics: [["雨量", "8 mm/h"], ["累積", "34 mm"], ["変位", "0.8 mm"]], note: "変化なし" },
      { label: "11:00", risk: "正常", values: [28, 1.4, 0.16], metrics: [["雨量", "18 mm/h"], ["累積", "68 mm"], ["変位", "1.4 mm"]], note: "小さな表層変化" },
      { label: "12:00", risk: "注意", values: [46, 3.9, 0.36], metrics: [["雨量", "31 mm/h"], ["累積", "104 mm"], ["変位", "3.9 mm"]], note: "裸地化が拡大" },
      { label: "13:00", risk: "注意", values: [62, 7.8, 0.58], metrics: [["雨量", "36 mm/h"], ["累積", "138 mm"], ["変位", "7.8 mm"]], note: "地すべり領域を検知" },
      { label: "14:00", risk: "警戒", values: [78, 14.6, 0.82], metrics: [["雨量", "42 mm/h"], ["累積", "168 mm"], ["変位", "14.6 mm"]], note: "警戒基準超過" },
      { label: "15:00", risk: "警戒", values: [82, 15.9, 0.88], metrics: [["雨量", "36 mm/h"], ["累積", "176 mm"], ["変位", "15.9 mm"]], note: "拡大継続" }
    ],
    "river-monitoring": [
      { label: "10:00", risk: "正常", values: [8, 3, 0.08], metrics: [["雨量", "4 mm/h"], ["路面水位", "3 cm"], ["冠水", "6%"]], note: "路肩のみ" },
      { label: "11:00", risk: "正常", values: [22, 7, 0.18], metrics: [["雨量", "18 mm/h"], ["路面水位", "7 cm"], ["冠水", "14%"]], note: "滞水開始" },
      { label: "12:00", risk: "注意", values: [48, 14, 0.42], metrics: [["雨量", "32 mm/h"], ["路面水位", "14 cm"], ["冠水", "27%"]], note: "車線端へ拡大" },
      { label: "13:00", risk: "注意", values: [66, 21, 0.64], metrics: [["雨量", "38 mm/h"], ["路面水位", "21 cm"], ["冠水", "39%"]], note: "通行注意に接近" },
      { label: "14:00", risk: "警戒", values: [76, 29, 0.84], metrics: [["雨量", "42 mm/h"], ["路面水位", "29 cm"], ["冠水", "48%"]], note: "通行注意超過" },
      { label: "15:00", risk: "警戒", values: [72, 31, 0.91], metrics: [["雨量", "38 mm/h"], ["路面水位", "31 cm"], ["冠水", "54%"]], note: "上昇継続" }
    ],
    "inspection-damage": [
      { label: "写真1", risk: "正常", values: [8, 0.12, 0.2], metrics: [["延長", "0.4 m"], ["幅", "0.12 mm"], ["位置", "P1"]], note: "軽微" },
      { label: "写真2", risk: "注意", values: [28, 0.18, 0.36], metrics: [["延長", "1.1 m"], ["幅", "0.18 mm"], ["位置", "P1"]], note: "細いひび割れ" },
      { label: "写真3", risk: "注意", values: [46, 0.24, 0.52], metrics: [["延長", "1.8 m"], ["幅", "0.24 mm"], ["位置", "P2"]], note: "連続性あり" },
      { label: "写真4", risk: "注意", values: [58, 0.31, 0.66], metrics: [["延長", "2.3 m"], ["幅", "0.31 mm"], ["位置", "P2"]], note: "要記録" },
      { label: "写真5", risk: "警戒", values: [74, 0.38, 0.82], metrics: [["延長", "2.8 m"], ["幅", "0.38 mm"], ["位置", "P2"]], note: "基準超過" },
      { label: "現在", risk: "警戒", values: [80, 0.42, 0.88], metrics: [["延長", "3.1 m"], ["幅", "0.42 mm"], ["位置", "P2"]], note: "早期確認" }
    ]
  };
  const series = data[templateId] || data["river-monitoring"];
  return series[Math.max(0, Math.min(series.length - 1, index))];
}

function templateUx(templateId) {
  return {
    "slope-monitoring": {
      stageTitle: "斜面変化の推移",
      annotationAction: "崩れている範囲を塗る",
      annotationHelp: "茶色く裸地化した地すべり領域だけを塗ります。",
      trainingTarget: "地すべり領域",
      completedView: "斜面監視画面",
      resultCopy: "最新画像、雨量、変位を同時に見て、点検要否を判断します。"
    },
    "river-monitoring": {
      stageTitle: "冠水の広がり",
      annotationAction: "水がある範囲を塗る",
      annotationHelp: "道路面に広がった冠水域だけを塗ります。",
      trainingTarget: "冠水域",
      completedView: "道路冠水監視画面",
      resultCopy: "最新画像と水位データから、通行注意の判断を更新します。"
    },
    "inspection-damage": {
      stageTitle: "ひび割れ写真",
      annotationAction: "ひび割れをなぞる",
      annotationHelp: "線状のひび割れだけを細くなぞります。",
      trainingTarget: "ひび割れ",
      completedView: "点検支援画面",
      resultCopy: "検知位置、幅、延長を写真台帳コメントに反映します。"
    },
    "timeseries-anomaly": {
      stageTitle: "計測データ",
      annotationAction: "教師データを確認",
      annotationHelp: "正常、注意、警戒の過去データを見て、現在値の判定条件を調整します。",
      trainingTarget: "警戒判定",
      completedView: "時系列モニタリング画面",
      resultCopy: "現在値から警戒判定と予測レンジを更新します。"
    }
  }[templateId] || {
    stageTitle: "データ確認",
    annotationAction: "対象を指定",
    annotationHelp: "AIに学習させる対象だけを指定します。",
    trainingTarget: "対象",
    completedView: "完成画面",
    resultCopy: "入力データから判定結果を表示します。"
  };
}

function frameChartSvg(templateId, activeIndex = 0) {
  const series = [0, 1, 2, 3, 4, 5].map((index) => imageFrameData(templateId, index));
  const width = 420;
  const height = 164;
  const pad = 28;
  const scorePoints = series.map((item, index) => {
    const x = pad + ((width - pad * 2) / (series.length - 1)) * index;
    const y = height - pad - item.values[2] * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const current = series[activeIndex] || series[0];
  const cx = pad + ((width - pad * 2) / (series.length - 1)) * activeIndex;
  const cy = height - pad - current.values[2] * (height - pad * 2);
  return `<svg class="frame-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="時系列グラフ">
    <rect width="${width}" height="${height}" rx="10" fill="#f8fbff"></rect>
    <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#c9d8e8"></line>
    <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#c9d8e8"></line>
    <line x1="${pad}" y1="${height - pad - 0.72 * (height - pad * 2)}" x2="${width - pad}" y2="${height - pad - 0.72 * (height - pad * 2)}" stroke="#d98a1d" stroke-dasharray="6 6"></line>
    <polyline points="${scorePoints}" fill="none" stroke="#1d63b7" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
    <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="7" fill="#d98a1d" stroke="#fff" stroke-width="3"></circle>
    <text x="${width - pad - 112}" y="28" fill="#0b3d78" font-size="12" font-weight="900">検知スコア</text>
    <text x="${Math.max(34, cx - 18).toFixed(1)}" y="${Math.max(18, cy - 13).toFixed(1)}" fill="#875813" font-size="12" font-weight="900">${escapeHtml(current.risk)}</text>
  </svg>`;
}

function improveTargetLabel(value) {
  return {
    screen: "画面",
    prompt: "プロンプト",
    output: "出力",
    data: "データ"
  }[value] || "画面";
}

function specializedForm() {
  const selectedId = Array.from(state.selectedTemplates)[0] || state.templates[0]?.id || "slope-monitoring";
  const selected = state.templates.find((template) => template.id === selectedId) || state.templates[0];
  const cards = state.templates.map((template) => {
    const selected = state.selectedTemplates.has(template.id);
    const points = (template.features || template.flow || []).slice(0, 2);
    return html`
      <label class="template-card ${selected ? "selected" : ""}">
        <input data-template="${template.id}" type="radio" name="template" value="${template.id}" ${selected ? "checked" : ""}>
        <span class="pill">${escapeHtml(template.tag)}</span>
        <h3>${escapeHtml(template.title)}</h3>
        <div class="card-tags">
          ${points.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
        </div>
      </label>`;
  }).join("");

  return html`
    <p class="eyebrow">特化型AI</p>
    <h2>作るAIを選ぶ</h2>
    <div class="template-grid">${cards}</div>
    ${selected ? specializedExperience(selected) : ""}
    <input type="hidden" name="title" value="${escapeHtml(selected?.title || "特化型AI")}プロトタイプ">
    <input type="hidden" name="inputDescription" value="${escapeHtml(selected?.sample || selected?.inputs?.join("、") || "デフォルトデータ")}">
    <input type="hidden" name="outputDescription" value="${escapeHtml(selected?.outputs?.join("、") || "モニタリング画面")}">
    <input type="hidden" name="dataMode" value="default">
    <section class="quick-build">
      <div>
        <p class="eyebrow">追加要望</p>
        <h2>要望を足す</h2>
      </div>
      <label class="field">
        <span>追加したい画面・機能</span>
        <textarea name="instruction" placeholder="例：警戒レベルの根拠、担当者メモ、自治体向け速報文を入れたい。"></textarea>
      </label>
      <details class="file-details">
        <summary>手元データも追加する</summary>
        <label class="field">
          <span>画像・CSV・PDFなど</span>
          <input type="file" name="files" multiple>
        </label>
      </details>
    </section>`;
}

function specializedExperience(template) {
  const demo = {
    "slope-monitoring": {
      site: "A-03 斜面監視地点 / 固定カメラ + 変位計",
      samples: ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00"],
      labels: ["地すべり"],
      learn: "地すべり領域だけを検知するセグメンテーションモデルを学習",
      complete: "最新画像から地すべり領域を検知し、雨量・変位と合わせて警戒判定を出す監視アプリ",
      chart: ["雨量", "変位", "警戒"],
      mode: "annotation"
    },
    "river-monitoring": {
      site: "F-02 道路冠水監視地点 / アンダーパス / 水位標 + 固定カメラ",
      samples: ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00"],
      labels: ["冠水域"],
      learn: "道路上の冠水域だけを検知するセグメンテーションモデルを学習",
      complete: "最新カメラ画像と水位データから、冠水域、通行注意レベル、通知文を更新する監視アプリ",
      chart: ["水位", "雨量", "通行判断"],
      mode: "annotation"
    },
    "inspection-damage": {
      site: "B-07 コンクリート点検 / 近接写真 + 位置図",
      samples: ["写真1", "写真2", "写真3", "写真4", "写真5", "現在"],
      labels: ["ひび割れ"],
      learn: "細いひび割れだけを検知するセグメンテーションモデルを学習",
      complete: "点検写真からひび割れを検知し、位置図と点検コメントに反映する点検アプリ",
      chart: ["ひび延長", "最大幅", "位置"],
      mode: "annotation"
    },
    "timeseries-anomaly": {
      site: "S-04 地すべり計測地点 / 雨量計・地下水位計・伸縮計",
      samples: ["位置", "正常期間", "降雨", "水位上昇", "変位増加", "現在"],
      labels: ["正常", "注意", "警戒"],
      learn: "過去の正常・注意・警戒データから、現在値の警戒判定と24時間予測を学習",
      complete: "現在の雨量・地下水位・変位速度から、警戒判定と予測レンジを更新する監視アプリ",
      chart: ["雨量", "地下水位", "変位速度"],
      mode: "training"
    }
  }[template.id] || {
    site: "AIデモ地点",
    samples: ["サンプル1", "サンプル2", "サンプル3", "サンプル4", "サンプル5"],
    labels: ["異常候補を指定", "対象範囲を塗る", "出力を確認"],
    learn: "AIモデルを学習",
    complete: "判定結果を業務画面に反映するアプリ",
    chart: ["入力", "判定", "出力"],
    mode: "annotation"
  };
  const isTraining = demo.mode === "training";
  const teachLabel = isTraining ? "正解確認" : "正解付け";
  const boxes = annotationBoxes(template.id);
  const stats = annotationStats(template.id);
  const decision = timeSeriesDecision();
  const hasImages = imageTemplate(template.id);
  const step = Math.max(1, Math.min(4, state.specializedStep || 1));
  const displayFrameIndex = hasImages
    ? (Number.isFinite(state.sampleFrame[template.id]) ? state.sampleFrame[template.id] : annotationFrameIndex(template.id, step))
    : 0;
  const frameData = hasImages ? imageFrameData(template.id, displayFrameIndex) : null;
  const targetFrameIndex = imageTemplate(template.id) ? 5 : 0;
  const annotationLabel = {
    "slope-monitoring": "地すべり",
    "river-monitoring": "冠水域",
    "inspection-damage": "ひび割れ"
  }[template.id] || "対象範囲";
  const flowGuide = isTraining
    ? "データと目的を選び、現在値を判定・予測する画面にします。"
    : "対象を1つだけ塗り、検知モデルを完成画面に組み込みます。";
  const ux = templateUx(template.id);
  const flow = isTraining
    ? [["データ選択", "選ぶ"], ["目的確認", "見る"], ["AI学習", "学習"], ["完成画面", "生成"]]
    : [["データ確認", "見る"], [teachLabel, "塗る"], ["AI学習", "精度を見る"], ["完成画面", "生成する"]];
  const flowCards = flow.map(([title, text], index) => {
    const number = index + 1;
    return `<button type="button" data-flow-step="${number}" class="${number === step ? "current" : number < step ? "done" : ""}">
      <span>${number}</span><strong>${title}</strong><small>${text}</small>
    </button>`;
  }).join("");
  const sampleThumbs = demo.samples.map((item, index) => `
    <button type="button" data-sample-template="${escapeHtml(template.id)}" data-sample-frame="${index}" class="sample-thumb ${escapeHtml(template.id)} sample-${index + 1} ${index === displayFrameIndex ? "active" : ""}" ${hasImages ? `style="background-image:linear-gradient(180deg,rgba(16,32,51,0.02),rgba(16,32,51,0.46)),url('${monitoringImage(template.id, index)}')"` : ""}>
      <span>${escapeHtml(item)}</span>
    </button>`).join("");
  const maskMarkup = annotationMaskMarkup(boxes, annotationLabel);
  const accepted = boxes.length > 0;
  const tsDatasets = [
    { id: "slope", name: "地すべり計測", metrics: "雨量 / 地下水位 / 変位速度", site: "S-04 山腹斜面", current: "警戒寄り" },
    { id: "river", name: "河川水位", metrics: "雨量 / 水位 / 上昇速度", site: "R-08 水位観測所", current: "注意" },
    { id: "road", name: "道路冠水水位", metrics: "雨量 / 路面水位 / 排水稼働", site: "F-02 アンダーパス", current: "警戒" }
  ];
  const currentDataset = tsDatasets.find((item) => item.id === state.tsDataset) || tsDatasets[0];
  const goalLabel = state.tsGoal === "anomaly" ? "異常検知" : "推移予測";
  const teacherLabels = state.tsGoal === "anomaly"
    ? ["正常期間", "注意期間", "警戒期間", "現在値", "異常判定"]
    : ["過去24h", "現在値", "6h予測", "12h予測", "24h予測"];
  const dataPanel = isTraining ? `
    <div class="flow-stage">
      <div class="timeseries-select">
        <h3>データセット</h3>
        <div class="dataset-grid">
          ${tsDatasets.map((item) => `
            <button type="button" data-ts-dataset="${escapeHtml(item.id)}" class="${state.tsDataset === item.id ? "active" : ""}">
              <strong>${escapeHtml(item.name)}</strong>
              <span>${escapeHtml(item.metrics)}</span>
              <small>${escapeHtml(item.site)} / ${escapeHtml(item.current)}</small>
            </button>
          `).join("")}
        </div>
      </div>
      <aside class="stage-side">
        <h3>目的</h3>
        <div class="goal-switch">
          <button type="button" data-ts-goal="forecast" class="${state.tsGoal === "forecast" ? "active" : ""}">推移予測</button>
          <button type="button" data-ts-goal="anomaly" class="${state.tsGoal === "anomaly" ? "active" : ""}">異常検知</button>
        </div>
        <dl class="data-spec">
          <dt>選択中</dt><dd>${escapeHtml(currentDataset.name)}</dd>
          <dt>見る値</dt><dd>${escapeHtml(currentDataset.metrics)}</dd>
          <dt>作る画面</dt><dd>${escapeHtml(goalLabel)}アプリ</dd>
        </dl>
        <p class="side-note">${state.tsGoal === "anomaly" ? "外れ値や急変を拾う画面にします。" : "現在値から先の推移を予測する画面にします。"}</p>
        <button type="button" data-advance-flow>次へ</button>
      </aside>
    </div>` : `
    <div class="flow-stage">
      <div class="stage-main">
        <div class="stage-visual ${escapeHtml(template.id)} ${hasImages ? "real-frame" : ""}" ${hasImages ? `style="background-image:linear-gradient(180deg,rgba(7,24,44,0.02),rgba(7,24,44,0.18)),url('${monitoringImage(template.id, displayFrameIndex)}')"` : ""}>
          <div class="site-badge">${escapeHtml(demo.site)}</div>
        </div>
        <div class="sample-thumb-grid">${sampleThumbs}</div>
      </div>
      <aside class="stage-side">
        <h3>${escapeHtml(ux.stageTitle)}</h3>
        <div class="frame-time">${escapeHtml(frameData?.label || "データ")}</div>
        <div class="frame-risk ${frameData?.risk === "警戒" ? "alert" : frameData?.risk === "注意" ? "watch" : ""}">
          <span>状態</span><strong>${escapeHtml(frameData?.risk || "確認")}</strong>
        </div>
        ${frameChartSvg(template.id, displayFrameIndex)}
        <div class="frame-metrics">
          ${(frameData?.metrics || []).map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}
        </div>
        <p class="side-note">${escapeHtml(frameData?.note || ux.resultCopy)}</p>
        <button type="button" data-advance-flow>次へ</button>
      </aside>
    </div>`;
  const annotationPanel = isTraining ? `
    <div class="flow-stage">
      <div class="timeseries-lab">
        <div class="sensor-context compact">
          <div>
            <h3>${escapeHtml(currentDataset.site)}</h3>
            <p>${escapeHtml(currentDataset.metrics)}を同じ時刻で見ます。</p>
          </div>
          <div class="sensor-map precise">
            <span class="rain">雨量計</span>
            <span class="well">地下水位計</span>
            <span class="move">伸縮計</span>
          </div>
        </div>
        <div class="teacher-strip">
          ${teacherLabels.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
        </div>
        <div class="ts-chart-card">
          ${miniPredictionSvg(decision)}
          <div class="ts-stats">
            <div><span>${state.tsGoal === "anomaly" ? "異常スコア" : "現在スコア"}</span><strong>${decision.latestScore.toFixed(2)}</strong></div>
            <div><span>${state.tsGoal === "anomaly" ? "警戒度" : "24h予測"}</span><strong>${decision.forecast[2].toFixed(2)}</strong></div>
            <div><span>判定</span><strong>${decision.risk}</strong></div>
          </div>
        </div>
      </div>
      <aside class="stage-side">
        <h3>${escapeHtml(goalLabel)}</h3>
        <label class="range-field">
          <span>警戒ライン <strong>${decision.threshold.toFixed(2)}</strong></span>
          <input data-timeseries-control="threshold" type="range" min="55" max="90" value="${state.tsThreshold}">
        </label>
        <p class="side-note">低くすると警戒判定になりやすく、高くすると見逃しを抑える代わりに通知が減ります。</p>
        <div class="decision-card ${decision.risk === "警戒" ? "alert" : decision.risk === "注意" ? "watch" : ""}">
          <span>現在値を反映</span>
          <strong>${decision.risk}</strong>
        </div>
        <button type="button" data-advance-flow>学習へ進む</button>
      </aside>
    </div>` : `
    <div class="flow-stage">
      <div class="annotation-workbench">
        <div class="stage-visual ${escapeHtml(template.id)} annotation-canvas real-frame ${accepted ? "accepted" : ""}" data-annotation-canvas="${escapeHtml(template.id)}" style="background-image:linear-gradient(180deg,rgba(7,24,44,0.02),rgba(7,24,44,0.14)),url('${monitoringImage(template.id, displayFrameIndex || targetFrameIndex)}')">
          ${maskMarkup}
          <div class="annotation-hint">${accepted ? "教師データ作成済み" : escapeHtml(ux.annotationAction)}</div>
        </div>
        <div class="annotation-toolbar paint">
          <label class="brush-size">
            <span>塗り幅</span>
            <input data-annotation-brush="${escapeHtml(template.id)}" type="range" min="4" max="44" value="${state.annotationBrush}">
          </label>
          <button type="button" data-annotation-undo="${escapeHtml(template.id)}" ${boxes.length ? "" : "disabled"}>戻す</button>
          <button type="button" data-annotation-clear="${escapeHtml(template.id)}" ${boxes.length ? "" : "disabled"}>消す</button>
        </div>
      </div>
      <aside class="stage-side">
        <h3>${escapeHtml(annotationLabel)}</h3>
        <div class="annotation-status ${accepted ? "done" : ""}">
          <strong>${accepted ? "教師データを作成済み" : escapeHtml(ux.annotationAction)}</strong>
          <span>${escapeHtml(ux.annotationHelp)}</span>
        </div>
        <div class="seg-stats simple">
          <div><span>ラベル</span><strong>1</strong></div>
          <div><span>対象</span><strong>${escapeHtml(annotationLabel)}</strong></div>
          <div><span>学習</span><strong>${accepted ? "OK" : "未"}</strong></div>
        </div>
        <button type="button" data-advance-flow ${accepted ? "" : "disabled"}>学習へ進む</button>
      </aside>
    </div>`;
  const trainingPanel = `
    <div class="flow-stage">
      <div class="training-card">
        <h3>AI学習</h3>
        <div class="train-loader" aria-hidden="true">
          <span></span><span></span><span></span><span></span>
        </div>
        <div class="train-pipeline">
          <span class="done">教師データ</span>
          <span class="active">学習中</span>
          <span>検証</span>
          <span>アプリ反映</span>
        </div>
        <div class="train-progress"><span style="width:92%"></span></div>
        <div class="train-metrics">
          <div><strong>${isTraining ? "0.87" : stats.score.toFixed(2)}</strong><span>${isTraining ? "異常検知AUC" : "mIoU"}</span></div>
          <div><strong>${isTraining ? "24h" : stats.boundary.toFixed(2)}</strong><span>${isTraining ? "予測範囲" : "境界精度"}</span></div>
          <div><strong>${isTraining ? decision.risk : `${stats.coverage.toFixed(1)}%`}</strong><span>${isTraining ? "現在判定" : annotationLabel}</span></div>
        </div>
      </div>
      <aside class="stage-side">
        <h3>結果</h3>
        <dl class="data-spec">
          <dt>モデル</dt><dd>${escapeHtml(demo.learn)}</dd>
          <dt>利用</dt><dd>${escapeHtml(ux.completedView)}に組み込み</dd>
        </dl>
        <button type="button" data-advance-flow>次へ</button>
      </aside>
    </div>`;
  const completePanel = `
    <div class="flow-stage">
      <div class="completion-preview">
        ${hasImages ? `
          <div class="preview-left ${escapeHtml(template.id)} real-frame" style="background-image:linear-gradient(180deg,rgba(7,24,44,0.02),rgba(7,24,44,0.14)),url('${monitoringImage(template.id, displayFrameIndex || targetFrameIndex)}')">
            ${segmentationPreviewMarkup(template.id, displayFrameIndex || targetFrameIndex)}
            <strong>${escapeHtml(frameData?.label || "最新")} / AI検知</strong>
          </div>` : `
          <div class="preview-timeseries">
            ${miniPredictionSvg(decision)}
          </div>`}
        <div class="preview-right">
          <h3>${escapeHtml(ux.completedView)}</h3>
          ${hasImages ? frameChartSvg(template.id, displayFrameIndex || targetFrameIndex) : `
            <div class="decision-card ${decision.risk === "警戒" ? "alert" : decision.risk === "注意" ? "watch" : ""}">
              <span>${escapeHtml(goalLabel)}</span>
              <strong>${decision.risk}</strong>
            </div>`}
          <div class="frame-metrics">
            ${hasImages
              ? (frameData?.metrics || []).map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")
              : `<div><span>現在</span><strong>${decision.latestScore.toFixed(2)}</strong></div><div><span>24h</span><strong>${decision.forecast[2].toFixed(2)}</strong></div><div><span>判定</span><strong>${decision.risk}</strong></div>`}
          </div>
          <p class="side-note">${escapeHtml(ux.resultCopy)}</p>
        </div>
      </div>
      <aside class="stage-side">
        <h3>完成</h3>
        <dl class="data-spec">
          <dt>画面</dt><dd>画像・グラフ・判定</dd>
          <dt>出力</dt><dd>${escapeHtml(template.outputs?.slice(0, 2).join(" / ") || "")}</dd>
        </dl>
      </aside>
    </div>`;
  const panels = [dataPanel, annotationPanel, trainingPanel, completePanel];
  return html`
    <section class="ai-experience">
      <div class="experience-head">
        <div>
          <p class="eyebrow">AI開発</p>
          <h2>${escapeHtml(template.title)} 開発体験</h2>
          <p>${escapeHtml(flowGuide)}</p>
        </div>
        <span class="pill">${escapeHtml(template.tag)}</span>
      </div>
      <div class="dev-flow">${flowCards}</div>
      ${panels[step - 1]}
    </section>`;
}

function generativeForm() {
  return html`
    <p class="eyebrow">生成AI</p>
    <h2>生成AI活用アプリを作る</h2>
    <p class="lead">テンプレートを選ぶか、自由に指示を書きます。</p>
    <section class="simple-generator">
      <div class="example-chips">
        ${generativeExamples.map((item, index) => `<button type="button" class="${index === 0 ? "active" : ""}" data-example="${escapeHtml(item.prompt)}">${escapeHtml(item.label)}</button>`).join("")}
      </div>
      <label class="field">
        <span>指示文</span>
        <textarea name="instruction" class="big-prompt">${escapeHtml(generativeExamples[0].prompt)}</textarea>
      </label>
      <input type="hidden" name="title" value="生成AI業務アプリ">
      <input type="hidden" name="inputDescription" value="アップロード資料または入力テキスト">
      <input type="hidden" name="outputDescription" value="業務で使える下書き、要点、確認事項を生成">
      <div class="gen-summary">
        <strong>この生成AIアプリがすること</strong>
        <p>生成AI活用の指示から作成した、すぐ試せる業務アプリです。</p>
      </div>
      <div class="gen-flow-preview">
        <div><span>入力</span><strong>資料・メモ・CSV</strong></div>
        <div><span>AI処理</span><strong>抽出・整理・文章化</strong></div>
        <div><span>出力</span><strong>下書き・表・確認事項</strong></div>
      </div>
      <label class="drop-zone">
        <input type="file" name="files" multiple>
        <strong data-file-label>ここにドラッグ、またはクリックして選択</strong>
        <span>PDF / Word / Excel / CSV / 画像メモ</span>
      </label>
    </section>`;
}

async function submitProject(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = document.getElementById("submitBtn");
  const jobArea = document.getElementById("jobArea");
  submit.disabled = true;
  jobArea.innerHTML = `<div class="log-panel">ジョブを作成しています...</div>`;

  const data = new FormData(form);
  data.set("aiType", state.aiType);
  data.set("selectedTemplateIds", JSON.stringify(state.aiType === "specialized" ? Array.from(state.selectedTemplates) : []));
  data.set("timeseriesDataset", state.tsDataset);
  data.set("timeseriesGoal", state.tsGoal);
  const hasFiles = Array.from(form.querySelectorAll('input[type="file"]')).some((input) => input.files && input.files.length > 0);
  if (hasFiles) data.set("dataMode", "upload");
  if (state.aiType === "generative") {
    const instruction = String(data.get("instruction") || "").trim() || generativeExamples[0].prompt;
    data.set("instruction", instruction);
    data.set("title", instruction.slice(0, 30) + (instruction.length > 30 ? "..." : ""));
    data.set("inputDescription", "アップロード資料または入力テキスト");
    data.set("outputDescription", "業務で使える下書き、要点、確認事項を生成");
  }

  try {
    const response = await api("/api/projects", { method: "POST", body: data });
    state.activeProjectId = response.project.id;
    state.keepImproveOpen = false;
    await loadWorkspace();
    renderApp();
    pollProject(response.project.id);
  } catch (error) {
    jobArea.innerHTML = `<p class="error">生成に失敗しました: ${escapeHtml(error.message)}</p>`;
    submit.disabled = false;
  }
}

function pollProject(id) {
  if (state.polling) clearInterval(state.polling);
  state.activeProjectId = id;
  renderJobArea(null, id);
  state.polling = setInterval(async () => {
    try {
      const { project } = await api(`/api/projects/${id}`);
      renderJobArea(project);
      if (["ready", "error"].includes(project.status)) {
        clearInterval(state.polling);
        state.polling = null;
        await loadWorkspace();
        if (project.status === "ready") {
          state.view = "archive";
          if (!state.keepImproveOpen) state.activeProjectId = null;
          history.replaceState(null, "", state.activeProjectId ? `#archive:${state.activeProjectId}` : "#archive");
          state.keepImproveOpen = false;
        }
        renderApp();
      }
    } catch {
      clearInterval(state.polling);
      state.polling = null;
    }
  }, 1200);
}

function cleanBuildLogLine(line) {
  const body = String(line || "")
    .replace(/^\[[^\]]+\]\s*/, "")
    .replace(/Codex CLI/g, "codex")
    .trim();
  const codexMatch = /^codex(?: err)?:\s*(.+)$/i.exec(body);
  if (!codexMatch) return body;
  const raw = codexMatch[1].trim();
  try {
    const parsed = JSON.parse(raw);
    const natural = naturalCodexMessage(parsed);
    if (natural) return natural;
  } catch {
    // Keep raw text when codex emits plain logs.
  }
  if (/bwrap|sandbox|namespace|apply_patch verification/i.test(raw)) {
    return "AIが安全な作業環境を確認し、作業方法を調整しています。";
  }
  if (/error|failed/i.test(raw)) return "AIが作業中の問題を検知し、別の進め方を試しています。";
  return raw.length > 180 ? `${raw.slice(0, 180)}...` : raw;
}

function compactAiText(text, limit = 190) {
  return String(text || "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit)
    .replace(/\s+\S*$/, (tail) => tail.length > 12 ? "" : tail);
}

function naturalCodexMessage(event) {
  if (event.type === "turn.completed") {
    return "AIの作業が完了しました。生成した画面を確認しています。";
  }
  const item = event.item || {};
  if (item.type === "agent_message") {
    return compactAiText(item.text || "AIが方針を整理しています。", 220);
  }
  if (item.type === "command_execution") {
    const command = String(item.command || "");
    const output = String(item.aggregated_output || "");
    if (/bwrap|namespace|sandbox/i.test(output)) {
      return "AIが安全な作業環境を確認しています。";
    }
    if (item.status === "in_progress") {
      if (/rg --files|find /.test(command)) return "AIがアプリのファイル構成を確認しています。";
      if (/sed -n|cat /.test(command)) return "AIが画面ファイルの内容を読み取っています。";
      if (/apply_patch|node|npm|python|tee|cat >/.test(command)) return "AIが画面や処理を更新しています。";
      return "AIが必要な作業を進めています。";
    }
    if (item.status === "failed") {
      return "AIが作業結果を確認し、別の進め方に切り替えています。";
    }
    if (/rg --files|find /.test(command)) return "AIが必要なファイルを把握しました。";
    if (/sed -n|cat /.test(command)) return "AIが既存画面の構成を確認しました。";
    if (/apply_patch|node|npm|python|tee|cat >/.test(command)) return "AIが画面ファイルを更新しました。";
    return "AIが作業結果を確認しました。";
  }
  return event.message || event.msg || event.text || "";
}

function buildStateHtml(project, projectId = "") {
  if (!project) {
    return html`
      <section class="build-state">
        <strong>AIがアプリを作成しています</strong>
        <div class="build-steps">
          <span class="active">設計</span>
          <span>AI反映</span>
          <span>デモ更新</span>
        </div>
        <div class="live-log">
          <div class="live-log-head">
            <span>AIの作業メモ</span>
            <small>生成中</small>
          </div>
          <ol>
            <li>プロンプトを受信しました。</li>
            <li>作りたいアプリの入力、処理、出力を整理しています。</li>
          </ol>
        </div>
      </section>`;
  }
  const lastLog = (project.logs || []).slice(-1)[0] || "";
  const cleanLog = cleanBuildLogLine(lastLog);
  const logs = (project.logs || []).slice(-12).map(cleanBuildLogLine).filter(Boolean);
  const codexTouched = (project.logs || []).some((line) => /Codex CLI|codex:/i.test(line));
  return html`
    <section class="build-state ${project.status}">
      <strong>${project.status === "ready" ? "アプリが完成しました" : project.status === "error" ? "作成に失敗しました" : "AIがアプリを作成しています"}</strong>
      <p>${project.status === "ready" ? "デモ画面を開いて、必要ならすぐ改良できます。" : project.status === "error" ? "入力を短くして再作成してください。" : "画面、処理、出力をアプリとして組み立てています。"}</p>
      <div class="build-steps">
        <span class="active">設計</span>
        <span class="${project.status !== "queued" || codexTouched ? "active" : ""}">AI反映</span>
        <span class="${project.status === "ready" ? "active" : ""}">デモ更新</span>
      </div>
      ${cleanLog ? `<p class="build-log">${escapeHtml(cleanLog.slice(0, 160))}</p>` : ""}
      <div class="live-log">
        <div class="live-log-head">
          <span>AIの作業メモ</span>
          <small>${project.status === "ready" ? "完了" : project.status === "error" ? "停止" : "生成中"}</small>
        </div>
        <ol>
          ${(logs.length ? logs : ["AIが作業内容を整理しています。"]).map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
        </ol>
      </div>
      ${project.previewUrl ? `<a class="primary-link" href="${project.previewUrl}" target="_blank" rel="noreferrer">デモ画面を開く</a>` : ""}
    </section>`;
}

function renderJobArea(project, projectId = state.activeProjectId) {
  const htmlText = buildStateHtml(project, projectId);
  const areas = [
    ...document.querySelectorAll("#jobArea"),
    ...document.querySelectorAll(`[data-live-log="${project?.id || projectId}"]`)
  ];
  areas.forEach((area) => {
    area.innerHTML = htmlText;
  });
}

function renderArchive(container) {
  const cards = state.projects.map((project) => html`
    <article class="archive-card ${state.activeProjectId === project.id ? "active" : ""}">
      <span class="pill">${project.aiType === "specialized" ? "特化型AI開発" : "生成AI活用"}</span>
      <h3>${escapeHtml(project.title)}</h3>
      <p>${escapeHtml(project.aiType === "generative" ? "すぐ試せる生成AI業務アプリです。" : project.instruction || "デフォルトデータで動く特化型AIデモです。")}</p>
      <span class="status ${project.status}">${statusLabel[project.status] || project.status}</span>
      <div class="actions">
        ${project.previewUrl ? `<a class="primary-link" href="${project.previewUrl}" target="_blank" rel="noreferrer">デモ画面を開く</a>` : ""}
        <button class="danger" type="button" data-delete-project="${project.id}">削除</button>
      </div>
      ${state.activeProjectId === project.id ? improvePanel(project) : ""}
    </article>`).join("");

  container.innerHTML = html`
    <header class="page-head">
      <div>
        <p class="eyebrow">作成済みアプリ</p>
        <h1>作ったアプリ</h1>
        <p>完成デモを開く、削除する。</p>
      </div>
      <button type="button" class="secondary" data-view="builder">新しく作る</button>
    </header>
    ${state.projects.length ? `<section class="archive-grid">${cards}</section>` : `<div class="empty">まだ作成したアプリはありません。</div>`}`;

  document.querySelectorAll("[data-improve-form]").forEach((form) => {
    form.addEventListener("submit", submitImprovement);
  });
  document.querySelectorAll("[data-delete-project]").forEach((button) => {
    button.addEventListener("click", deleteProject);
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      history.replaceState(null, "", state.view === "archive" ? "#archive" : "#builder");
      renderApp();
    });
  });
}

async function deleteProject(event) {
  const id = event.currentTarget.dataset.deleteProject;
  if (!id) return;
  const project = state.projects.find((item) => item.id === id);
  if (!confirm(`${project?.title || "このアプリ"}を削除しますか？`)) return;
  await api(`/api/projects/${id}`, { method: "DELETE", body: "{}" });
  if (state.activeProjectId === id) state.activeProjectId = null;
  await loadWorkspace();
  renderApp();
}

function improvePanel(project) {
  const placeholder = project.aiType === "specialized"
    ? "例：画像と検知結果を左、グラフと判定根拠を右に固定し、担当者メモ欄を追加して"
    : "例：入力欄、生成結果、確認事項、送信用メール文面を1画面で見やすく並べて";
  return html`
    <form class="improve-panel" data-improve-form="${project.id}">
      <h4>AIに改良を指示する</h4>
      <input type="hidden" name="projectId" value="${project.id}">
      <input type="hidden" name="target" value="screen">
      <label class="field">
        <span>どう改良しますか</span>
        <textarea name="prompt" placeholder="${escapeHtml(placeholder)}"></textarea>
      </label>
      <div class="prompt-log" data-live-log="${project.id}">
        ${["queued", "generating"].includes(project.status) ? buildStateHtml(project, project.id) : ""}
      </div>
      <div class="actions">
        <button type="submit">改良してデモを更新</button>
      </div>
    </form>`;
}

async function submitImprovement(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const projectId = form.get("projectId");
  const prompt = String(form.get("prompt") || "").trim();
  if (!prompt) return;
  const submit = event.currentTarget.querySelector("button[type='submit']");
  const logArea = event.currentTarget.querySelector("[data-live-log]");
  submit.disabled = true;
  submit.textContent = "改良中...";
  if (logArea) logArea.innerHTML = buildStateHtml(null, projectId);
  await api(`/api/projects/${projectId}/improve`, {
    method: "POST",
    body: JSON.stringify({
      target: form.get("target"),
      prompt
    })
  });
  state.activeProjectId = projectId;
  state.keepImproveOpen = true;
  await loadWorkspace();
  renderApp();
  pollProject(projectId);
}

init().catch((error) => {
  app.innerHTML = `<div class="shell"><p class="error">${escapeHtml(error.message)}</p></div>`;
});
