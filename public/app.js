const app = document.getElementById("app");

let state = {
  me: null,
  view: "board",
  aiType: "specialized",
  builderStage: "select",
  templates: [],
  projects: [],
  selectedTemplates: new Set(["slope-monitoring"]),
  consultType: "specialized",
  consultScenario: "river-intrusion",
  consultText: "",
  activeProjectId: null,
  keepImproveOpen: false,
  improveTarget: "screen",
  specializedStep: 1,
  annotationBoxes: {},
  annotationBrush: 22,
  annotationAccepted: {},
  maskAdjustment: {},
  sampleFrame: {},
  stagedFiles: [],
  tsDataset: "slope",
  tsGoal: "forecast",
  tsThreshold: 72,
  tsSensitivity: 66,
  board: null,
  boardUpdatedAt: "",
  boardPoll: null,
  boardSaveTimer: null,
  boardInteracting: false,
  boardScrollLeft: null,
  boardScrollTop: null,
  presence: [],
  presencePoll: null,
  boardModal: null,
  polling: null
};

const BOARD_VIEW_PADDING = 720;
const BOARD_MIN_COORD = -BOARD_VIEW_PADDING + 48;

const statusLabel = {
  queued: "待機中",
  generating: "生成中",
  ready: "完成",
  error: "エラー"
};

const generativeExamples = [
  {
    id: "meeting-record",
    label: "打合せ記録簿",
    title: "打合せ記録簿作成アプリ",
    input: "議事録、会議メモ、音声文字起こし",
    output: "協議事項、指示事項、回答・対応方針、未確認事項、Wordで開ける記録簿",
    prompt: "議事録、会議メモ、音声文字起こしを入力すると、行政向けの打合せ記録簿を作成する業務アプリ。協議事項、指示事項、回答・対応方針、未確認事項を明確に分け、発注者に提出しやすい文体へ整える。ドラッグアンドドロップで議事録を読み込み、生成結果を画面で確認し、Wordで開ける記録簿ファイルとしてダウンロードできるようにする。"
  },
  {
    id: "workplan",
    label: "業務計画書",
    title: "業務計画書ドラフト作成アプリ",
    input: "特記仕様書、過去の業務計画書、現場条件メモ",
    output: "章立て、実施方針、工程、体制、照査ポイント、顧客確認事項",
    prompt: "特記仕様書、過去の業務計画書、現場条件メモを入力すると、業務条件を抽出し、業務計画書の章立て、実施方針、工程、実施体制、照査ポイント、顧客確認事項を1画面で生成する業務アプリ。左に入力資料、中央に抽出条件、右に計画書ドラフトと確認事項を表示し、Wordに貼り付けやすい文章で出力する。"
  },
  {
    id: "todo",
    label: "議事録ToDo",
    title: "議事録ToDo整理アプリ",
    input: "会議メモ、音声文字起こし、配布資料",
    output: "要点、決定事項、担当者別ToDo、期限、未確認事項、次回確認メール",
    prompt: "会議メモ、音声文字起こし、配布資料を入力すると、議題別の要点、決定事項、担当者別ToDo、期限、未確認事項、次回確認メールを生成するアプリ。発言メモをそのまま貼っても、業務で使える議事録形式に整え、抜け漏れがある項目は確認リストとして分けて表示する。"
  },
  {
    id: "inspection-report",
    label: "点検報告書",
    title: "点検報告書ドラフト作成アプリ",
    input: "点検写真メモ、損傷位置、過年度コメント",
    output: "損傷区分、写真台帳コメント、健全性所見、補修要否、報告書本文、不足確認事項",
    prompt: "点検写真メモ、損傷位置、過年度コメントを入力すると、損傷区分、写真台帳コメント、健全性の所見、補修要否、報告書本文の下書き、不足確認事項を生成するアプリ。入力欄、写真メモ一覧、AI所見、報告書ドラフト、確認チェックリストを1画面で扱えるようにする。"
  },
  {
    id: "proposal",
    label: "提案書",
    title: "AI活用提案書作成アプリ",
    input: "顧客からの相談内容、対象現場、保有データ、制約条件",
    output: "課題整理、AI活用方針、PoC案、必要データ、スケジュール、提案メール",
    prompt: "顧客からの相談内容、対象現場、保有データ、制約条件を入力すると、課題整理、AI活用方針、PoC案、必要データ、概算スケジュール、体制、提案メール文面を生成するアプリ。営業担当がその場で提案骨子を確認し、社内相談に回せる粒度で出力する。"
  },
  {
    id: "free",
    label: "フリー作成",
    title: "",
    input: "",
    output: "",
    prompt: "",
    free: true
  }
];

const consultationScenarios = [
  {
    id: "river-intrusion",
    type: "specialized",
    title: "河川CCTV侵入検知",
    tag: "カメラ監視",
    templateId: "river-monitoring",
    dataset: "intrusion",
    goal: "detection",
    prompt: "実データはまだありません。河川CCTVで管理区域への人の侵入を検知し、危険区域に入った場合に監視画面で赤く表示し、現地確認のアラート文を出すデモを作りたいです。CCTV画像1件と検知結果1件の簡易モックから、完成イメージが分かるモニタリングコンソールにしてください。",
    output: "河川CCTV画像、人の侵入検知、危険区域判定、現地確認アラート",
    frames: ["CCTV", "検知", "判定", "通知"]
  },
  {
    id: "flood-alert",
    type: "specialized",
    title: "水位・雨量 洪水アラート",
    tag: "水位計 + 雨量",
    templateId: "timeseries-anomaly",
    dataset: "river",
    goal: "forecast",
    prompt: "実データはまだありません。河川の水位計と雨量データから、6時間後から24時間後の洪水リスクを予測し、警戒ラインに近づく場合に自治体向けのアラート文を出すデモを作りたいです。水位・雨量のデモデータ1セットから、予測レンジと警戒判定が一目で分かる監視コンソールにしてください。",
    output: "水位・雨量の時系列、洪水リスク予測、警戒判定、自治体向けアラート",
    frames: ["水位計", "雨量", "上昇速度", "6h予測", "24h予測"]
  },
  {
    id: "slope-consult",
    type: "specialized",
    title: "斜面監視AI相談",
    tag: "斜面 + 変位",
    templateId: "slope-monitoring",
    dataset: "slope",
    goal: "forecast",
    prompt: "実データはまだありません。豪雨後の斜面監視カメラ画像と雨量・変位データを使い、地すべり領域を検知し、点検要否を判断するデモを作りたいです。画像、グラフ、警戒判定、点検依頼文まで見える画面にしてください。",
    output: "斜面画像、地すべり検知、雨量・変位グラフ、点検依頼文",
    frames: ["平常", "降雨", "変化", "拡大", "警戒", "現在"]
  },
  {
    id: "other-specialized",
    type: "specialized",
    title: "その他",
    tag: "自由相談",
    templateId: "river-monitoring",
    dataset: "custom",
    goal: "detection",
    prompt: "",
    output: "相談内容に合わせたデモ画像、AI判定、完成画面",
    frames: ["相談", "画像生成", "AI判定", "完成画面"]
  },
  {
    id: "meeting-record",
    type: "generative",
    title: "打合せ記録簿作成",
    tag: "行政向け文書",
    templateId: "",
    prompt: "議事録や会議メモをドラッグアンドドロップすると、行政向けの打合せ記録簿を作成するアプリを作りたいです。協議事項、指示事項、回答・対応方針、未確認事項を分け、事後記載でも不足が分かる確認リストを付け、Wordで開けるファイルとしてダウンロードできるようにしてください。",
    output: "打合せ記録簿、協議事項、指示事項、確認リスト、Wordダウンロード",
    frames: ["議事録", "抽出", "整理", "記録簿"]
  },
  {
    id: "proposal-consult",
    type: "generative",
    title: "AI活用提案書作成",
    tag: "相談整理",
    templateId: "",
    prompt: "顧客からの相談メモを入力すると、AI活用の課題整理、PoC案、必要データ、スケジュール、提案メールを作る業務アプリを作りたいです。土木分野のAI相談を、支社の担当者がすぐ社内共有できる形にしてください。",
    output: "課題整理、PoC案、必要データ、提案メール",
    frames: ["相談", "課題", "PoC", "提案"]
  },
  {
    id: "other-generative",
    type: "generative",
    title: "その他",
    tag: "自由相談",
    templateId: "",
    prompt: "",
    output: "相談内容に合わせた入力、生成処理、成果物",
    frames: ["相談", "整理", "生成", "完成"]
  }
];

const BOARD_VERSION = 7;
const BOARD_CANVAS_WIDTH = 1900;
const BOARD_CANVAS_HEIGHT = 1420;
const BOARD_AUDIENCE_INTERNAL = "internal";
const BOARD_AUDIENCE_EXTERNAL = "external";
const BOARD_AUDIENCE_LANE_WIDTH = 1120;
const BOARD_AUDIENCE_GAP = 0;
const BOARD_EXTERNAL_X = BOARD_AUDIENCE_LANE_WIDTH + BOARD_AUDIENCE_GAP;
const BOARD_AUDIENCE_SWITCH_X = BOARD_EXTERNAL_X;
const BOARD_LANE_TOP = 60;
const BOARD_RENDER_ZOOM = 0.7;

const defaultBoardTags = [
  { id: "proposal-sales", name: "営業・提案", color: "#1d63b7" },
  { id: "business-ops", name: "社内業務", color: "#0f8b8d" },
  { id: "public-redaction", name: "公開成果物", color: "#dc2626" },
  { id: "env-survey", name: "環境調査", color: "#16a34a" },
  { id: "disaster-monitoring", name: "防災・監視", color: "#f97316" },
  { id: "river-road", name: "河川・道路", color: "#0ea5e9" },
  { id: "geology-boring", name: "地質・ボーリング", color: "#7c3aed" }
];

const defaultPanelTags = {
  p01: "proposal-sales",
  p02: "proposal-sales",
  p03: "proposal-sales",
  p04: "proposal-sales",
  p05: "business-ops",
  p06: "disaster-monitoring",
  p07: "disaster-monitoring",
  p08: "business-ops",
  p09: "public-redaction",
  p10: "env-survey",
  p11: "public-redaction",
  p12: "proposal-sales",
  p13: "business-ops",
  p14: "business-ops",
  p15: "river-road",
  p16: "river-road",
  p17: "geology-boring",
  p18: "geology-boring",
  p19: "proposal-sales",
  p20: "geology-boring"
};

const legacyTagMap = {
  "sales-admin": "proposal-sales",
  tohoku: "disaster-monitoring",
  chubu: "river-road",
  boring: "geology-boring",
  "env-energy": "env-survey",
  "public-redaction": "public-redaction"
};

const defaultPanelAudience = {
  p01: BOARD_AUDIENCE_INTERNAL,
  p02: BOARD_AUDIENCE_INTERNAL,
  p03: BOARD_AUDIENCE_INTERNAL,
  p04: BOARD_AUDIENCE_INTERNAL,
  p05: BOARD_AUDIENCE_INTERNAL,
  p06: BOARD_AUDIENCE_EXTERNAL,
  p07: BOARD_AUDIENCE_EXTERNAL,
  p08: BOARD_AUDIENCE_INTERNAL,
  p09: BOARD_AUDIENCE_INTERNAL,
  p10: BOARD_AUDIENCE_INTERNAL,
  p11: BOARD_AUDIENCE_INTERNAL,
  p12: BOARD_AUDIENCE_INTERNAL,
  p13: BOARD_AUDIENCE_INTERNAL,
  p14: BOARD_AUDIENCE_INTERNAL,
  p15: BOARD_AUDIENCE_EXTERNAL,
  p16: BOARD_AUDIENCE_EXTERNAL,
  p17: BOARD_AUDIENCE_EXTERNAL,
  p18: BOARD_AUDIENCE_EXTERNAL,
  p19: BOARD_AUDIENCE_INTERNAL,
  p20: BOARD_AUDIENCE_EXTERNAL
};

const boardAudienceLabels = {
  [BOARD_AUDIENCE_INTERNAL]: {
    label: "社内",
    description: "社内業務を効率化"
  },
  [BOARD_AUDIENCE_EXTERNAL]: {
    label: "社外",
    description: "技術提案・売れる技術"
  }
};

const defaultPanelDiscussion = {
  p01: {
    solutions: ["既存の営業管理・文書作成フローに、入力補助モジュールとして開発する。", "過去様式と社員情報の取得方法を確認し、まずは生成AIの下書き画面で検証する。"],
    notes: ["担当: 営業管理側で現行様式と参照データを確認する。", "次回: 指名願い資料の実例を1件用意し、入力項目の不足を洗い出す。"]
  },
  p02: {
    solutions: ["TECRIS・プロポ戦略室の情報を参照する既存アプリ連携モジュールとして検討する。", "連携が難しい場合は、データをダウンロードしてアップロード処理する形で試作する。"],
    notes: ["確認: TECRIS情報の取得範囲、プロポ戦略室の表現ルール、閲覧権限。", "次回: 技術者経歴のサンプルデータを匿名化して用意する。"]
  },
  p03: {
    solutions: ["生成AI活用アプリとして開発し、企画書PDFと見積表を照合して質問事項を抽出する。", "既存積算システムと直接連携できない場合は、Excel/CSVを取り込む方式にする。"],
    notes: ["担当: 企画書と見積項目のズレが出た実例を集める。", "次回: 抽出したい質問事項の型を3種類に整理する。"]
  },
  p04: {
    solutions: ["NETISの公開情報を検索・要約するモジュールとして開発可能か確認する。", "APIが使えない場合は、検索URL・CSV・手入力キーワード連携で代替する。"],
    notes: ["確認: API利用可否、スクレイピング可否、社内利用時の権利関係。", "保留: 具体的な検索対象技術と利用場面を決める。"]
  },
  p05: {
    solutions: ["シェアードサービス準備室と連携し、横断テーマの受付・整理ボードとして運用する。", "AI開発対象ではなく、課題受付からPoC候補化までの管理画面にする。"],
    notes: ["進捗: 四戸統括部長経由で相談済み。", "次回: シェアードサービス側で扱う業務範囲を確認する。"]
  },
  p06: {
    solutions: ["技術系AIアプリとして開発し、災害写真から被災種別・留意点・初動対応を提示する。", "既存のイノベ2026テーマと重複するため、重複開発ではなく接続先を確認する。"],
    notes: ["進捗: イノベ2026で実施中。", "次回: 既存活動の画面・データ・担当者を確認する。", "検討: 検証案件を1件選び、開発体制と予算感を確認する。"]
  },
  p07: {
    solutions: ["単一写真判定ではなく、GPSとハザード情報を取り込む既存アプリ連携モジュールとして検討する。", "災害前写真は現地状況確認の補助に使い、危険度は地形・ハザード情報と組み合わせる。"],
    notes: ["確認: ハザード情報を取得できるAPI・公開データ・位置情報の精度。", "次回: 類似アプリの有無を調査する。"]
  },
  p08: {
    solutions: ["管理技術者向けの小さなAI補助として、打合せ記録簿・メールから対応事項を抽出する。", "タスク管理本体は既存ツールを使い、AIは抽出・登録補助モジュールにする。"],
    notes: ["進捗: 都市土木Cでコンプル試行中。", "確認: MS Planner、Backlog、コンプル等の運用方針。"]
  },
  p09: {
    solutions: ["AIアプリとして開発し、公開用成果物の氏名・顔・重要種位置・機微情報を検出して黒塗り候補を示す。", "最終出力前に人が承認するUIを必須にする。"],
    notes: ["優先: 国交省業務で需要が高く、PoC候補として有力。", "次回: 黒塗り基準文書、対象PDF、写真、図面サンプルを集める。", "検討: 検証案件、承認者、開発体制、概算予算を整理する。"]
  },
  p10: {
    solutions: ["AI単体ではなく、現場記録システム・ArcGIS連携として検討する。", "紙記録が残る場合のみOCR補助モジュールを作る。"],
    notes: ["確認: ArcGISで現場デジタル記録へ移行できるか。", "次回: 紙記録の頻度、文字のばらつき、GIS入力項目を確認する。"]
  },
  p11: {
    solutions: ["p09の公開用成果物黒塗りAIへ統合し、対象成果物ごとの処理テンプレートを作る。", "文章・写真・図面のどれを優先するかを決めてPoC化する。"],
    notes: ["整理: p09と重複。単独テーマではなく公開成果物タグの中で統合管理。", "次回: 国交省業務で実際に黒塗りが発生する成果物を確認する。"]
  },
  p12: {
    solutions: ["営業管理モジュールとして検討するが、外販性が低いため優先度は下げる。", "開発する場合はプロポ戦略室データを取り込めるか確認する。"],
    notes: ["確認: プロポ戦略室との連携可否、基礎点計算ルール、権限。", "判断: 技術支援系テーマより後回し。"]
  },
  p13: {
    solutions: ["AIアプリではなく、人事・社内システム側の評価支援モジュールとして扱う。", "各システムのデータ取得が難しい場合は、手入力・CSV連携に限定する。"],
    notes: ["確認: 人事制度側の評価項目と連携できる社内システム。", "判断: ワークショップのAIデモでは優先度低。"]
  },
  p14: {
    solutions: ["既存のsmartDB・ZAC・WonderWebに通知モジュールを追加できるか確認する。", "直接連携できない場合は、注文書・納期情報をCSVで取り込み、未回収・期限超過を一覧化する。"],
    notes: ["確認: 既存システムが毎月リマインドできるか。", "次回: 精算漏れ・回収遅れが起きた実例を確認する。"]
  },
  p15: {
    solutions: ["AIというより雨量データ集計・規制基準照合アプリとして開発する。", "必要に応じて将来雨量を取り込み、規制見込みを予測表示する。"],
    notes: ["確認: 詳細メッシュ雨量の取得方法、規制基準、観測地点リスト。", "次回: 現行マクロの処理内容を分解する。", "検討: 実道路の検証案件を選び、開発体制と予算を確認する。"]
  },
  p16: {
    solutions: ["水位・雨量の時系列予測AIとしてデモ化し、既存AIとの差分を整理する。", "既存AIがある場合は、説明画面・監視UI・通知文生成を追加モジュールとして検討する。"],
    notes: ["確認: 水位計と雨量計の位置、予測対象時間、既存AIの利用条件。", "次回: 6時間後・24時間後の予測結果をどう業務判断に使うか整理する。", "検討: 検証河川、モデル評価方法、開発体制、予算を整理する。"]
  },
  p17: {
    solutions: ["技術系AIアプリとして、まずはボーリングコア写真の酸化程度・亀裂面を小さく検出する。", "3次元化はコア回転撮影の運用を確認してから次段階にする。"],
    notes: ["確認: 教師データ量、過去件数、撮影条件の統一可否。", "次回: 代表写真を集め、判定ラベルを1つに絞る。", "検討: 教師データ作成者、開発体制、検証費用を確認する。"]
  },
  p18: {
    solutions: ["単一写真AIではなく、地形情報・0次谷AI・現地写真を組み合わせる技術系AIとして検討する。", "擦痕写真は専門家教師データがある場合のみPoC対象にする。"],
    notes: ["確認: 地形情報で判定できる範囲と、現地写真で補助できる範囲。", "次回: すべり面・擦痕の教師データ作成者を確認する。", "検討: 検証案件、教師データ作成、開発体制、予算を整理する。"]
  },
  p19: {
    solutions: ["営業支援は生成AIの小さな業務支援アプリとして扱い、技術支援系PoCとは分けて管理する。", "外販性が低いものは既存業務システムの補助モジュールとして検討する。"],
    notes: ["判断: 営業支援系AIは優先度低。", "次回: 営業管理タグ内で残すテーマ・保留するテーマを分ける。"]
  },
  p20: {
    solutions: ["事例内容を特定し、利用可能なら技術調査メモ・検索補助アプリとして扱う。", "権利関係が不明な場合は、社内検討メモに留める。"],
    notes: ["確認: 東亜建設事例がどの件か、公開情報か、社内資料か。", "次回: 参照可能範囲を確認してから判断する。"]
  }
};

function defaultBoard() {
  const board = {
    version: BOARD_VERSION,
    tags: defaultBoardTags.map((tag) => ({ ...tag })),
    panels: [
      boardPanel("p01", "指名願い資料作成支援", "issue", 80, 120, ["sales"], "指名願い資料の作成負担を下げる。", "必要項目、過去資料、技術者情報を整理し、提出用の下書きを作る。", ["過去様式と社員情報を読み込み、記入候補を生成する。"], ["営業支援AIの候補として整理"]),
      boardPanel("p02", "業務経歴書作成支援", "issue", 80, 290, ["sales"], "TECRISやプロポ戦略室情報と連携する。", "技術者の業務経歴書を案件条件に合わせて短時間で整える。", ["TECRISデータを参照し、案件に合う経歴を抽出する。", "プロポ戦略室の表現ルールをテンプレート化する。"], ["連携先データの確認が必要"]),
      boardPanel("p03", "積算質問事項の抽出支援", "detail", 380, 190, ["sales"], "企画書と見積項目の不整合を拾う。", "企画書の作業内容と見積項目を照合し、確認すべき質問事項を作る。", ["企画書PDFと見積表を入力し、抜け漏れ・重複・数量確認を出す。"], ["生成AI活用アプリとして試作しやすい"]),
      boardPanel("p04", "NETIS技術検索", "solution", 690, 160, ["sales"], "API制約を考慮した検索支援。", "NETIS技術を案件条件から探し、候補技術の要点と適用理由を示す。", ["公開情報の収集方式を確認する。", "まずは手入力キーワード検索と要約でモック化する。"], ["API可否の調査待ち"]),
      boardPanel("p05", "シェアードサービス準備室との連携", "progress", 990, 230, ["shared", "ops"], "四戸統括部長経由で相談済み。", "社内横断の業務支援テーマはシェアードサービス準備室と連携する。", ["相談経路を整理し、対象業務を優先順位付けする。"], ["メールにて相談済み"]),

      boardPanel("p06", "災害写真から対応策を提示", "issue", 1120, 120, ["technical"], "災害写真を読み、留意点や対応策を出す。", "現場写真から被災状況を分類し、初動対応・安全確認・追加調査の観点を示す。", ["写真1枚から被災種別、危険要因、現地確認項目を出す。"], ["相談モードの画像AIでデモ化しやすい"]),
      boardPanel("p07", "災害前写真から危険箇所抽出", "detail", 1420, 120, ["technical"], "平常時画像からリスク候補を拾う。", "災害前の斜面・河川・構造物写真から、危険箇所候補を見える化する。", ["地形・植生・水みち・劣化兆候の1ラベル検知から始める。"], ["デモ画像と検知結果の整合性が重要"]),
      boardPanel("p08", "管理技術者のAI秘書", "issue", 1120, 300, ["env", "ops"], "管理技術者の事務負担を減らす。", "打合せ記録簿、メール、電話メモ、提出期限から対応タスクを整理し、アラートを出す。", ["記録簿から対応事項・期限・担当を抽出する。", "メールや電話メモからタスクを追加できるようにする。"], ["環境・エネルギー本部の重点候補"]),
      boardPanel("p09", "公開用成果物の自動墨入れ", "solution", 1420, 330, ["public", "technical"], "個人情報や重要種位置を自動で隠す。", "公開用成果物の氏名、顔、重要種位置、図面上の機微情報を検出して墨入れ候補を作る。", ["PDF・画像・図面の対象別に検出ラベルを絞る。", "人が承認してから出力するUIにする。"], ["国交省業務では優先度が高い"]),
      boardPanel("p10", "猛禽類調査結果自動入力", "detail", 1120, 520, ["env", "technical"], "紙記録をGISとExcelに変換する。", "紙の調査結果をスキャンし、観察地点・時刻・種名・行動を読み取ってGIS/Excelへ整理する。", ["OCRと表抽出を組み合わせる。", "個性的な文字への対応精度を検証する。"], ["LECHERCA Scanの適用可否を確認"]),
      boardPanel("p11", "公開用成果物自動作成", "issue", 1420, 520, ["env", "public"], "公開資料作成の負担を軽減する。", "氏名、顔、重要種の確認位置が分かる文章・図面などを自動で確認し、墨消し候補を示す。", ["文書・写真・図面を横断して公開リスクをチェックする。"], ["技術支援AIと重複テーマとして統合検討"]),

      boardPanel("p12", "基礎点・技術者評価支援", "issue", 80, 650, ["chubu", "sales"], "管理技術者・担当技術者の基礎点を確認する。", "プロポ戦略室との連携が必要な、技術者評価・基礎点の確認支援。", ["評価条件と技術者情報を入力し、候補者比較を出す。"], ["中部支社メモから登録"]),
      boardPanel("p13", "個人目標の定量評価支援", "detail", 380, 670, ["chubu", "ops"], "人事制度改革に合わせた支援。", "会社システムと連携し、個人目標の定量評価をAIで下支えする。最後は人が確認する。", ["評価データの取得範囲を整理する。", "本人確認用の説明可能な出力にする。"], ["連携システムの確認が必要"]),
      boardPanel("p14", "民間案件の納期・精算漏れ管理", "solution", 690, 690, ["chubu", "ops"], "注文書が多い案件の回収遅れを防ぐ。", "社内工期は1つでも細かい注文書が多い案件で、納期管理・精算漏れ確認を行う。", ["WonderWeb連携またはCSV取り込みで試作する。", "未回収・期限超過をAI秘書として通知する。"], ["業務管理系デモとして有効"]),
      boardPanel("p15", "道路事前通行規制AI", "issue", 990, 690, ["chubu", "technical"], "連続雨量から規制判断を支援する。", "現在はマクロで時間がかかる規制判断を、雨量データと基準値から短時間で確認する。", ["雨量CSV、規制基準、観測地点を入力して判定する。", "将来雨量の予測レンジを重ねる。"], ["時系列AIデモに適する"]),
      boardPanel("p16", "河川管理の雨量・水位相関AI", "detail", 1290, 720, ["chubu", "technical"], "雨量と河川水位の相関を予測に使う。", "タンクモデル活用や河川管理のため、雨量と水位の関係を可視化・予測する。", ["水位計と雨量計の位置関係を表示する。", "6時間後・24時間後の予測を出す。"], ["洪水アラート相談と接続可能"]),
      boardPanel("p17", "ボーリングコア・ボアホールAI解析", "solution", 1590, 700, ["chubu", "technical"], "面構造や亀裂の酸化程度を解析する。", "ボーリングコア写真とボアホール画像から、未固結の亀裂面や酸化程度を把握し、3次元化まで検討する。", ["まずは亀裂面1ラベルの検出から始める。", "3D化はPoC後半の検討項目にする。"], ["画像AIとして難度は高め"]),
      boardPanel("p18", "地すべりすべり面・擦痕解析", "progress", 1890, 720, ["chubu", "technical"], "すべり面評価にAIを使う。", "すべり面の評価や擦痕情報を写真・記録から読み取り、評価支援につなげる。", ["擦痕の方向、粗さ、連続性を画像から抽出する。", "専門家の教師データ作成が必要。"], ["技術検証テーマとして保持"])
    ]
  };
  return applyBoardReviewComments(board);
}

function applyBoardReviewComments(board) {
  const reviews = {
    p06: {
      stage: "progress",
      feasibility: "実施中",
      assessment: "イノベ2026と同一",
      summary: "イノベ2026の内容と同一。実施中。",
      progress: ["イノベ2026で実施中", "新規PoCではなく既存活動との接続を確認"]
    },
    p07: {
      feasibility: "△",
      assessment: "単一写真では弱い",
      summary: "写真外の情報が必要。GPSとハザード情報連携が中心。",
      detail: "災害前写真だけで危険箇所を断定するのは難しい。GPS情報からハザード情報を取得し、写真と合わせてリスクを示すアプリの方が現実的。同一アプリが既にある可能性も確認する。",
      solutions: ["GPS位置からハザード情報を取得する。", "写真は現地状況確認用に使い、危険度判定は地形・ハザード情報と組み合わせる。"],
      progress: ["既存類似アプリの有無を確認"]
    },
    p08: {
      feasibility: "△",
      assessment: "タスク管理補助",
      summary: "一般的なプロジェクト・タスク管理補助。管理方法が決まった後の細かなAI支援が現実的。",
      detail: "MS Planner、Backlog、Retask、Asana、コンプルに近い領域。プロジェクト管理方法を先に決め、その中で打合せ記録簿やメールから対応事項を拾う小さなAIを開発するのがよい。都市土木Cでは複数ツールを試し、コンプルを試行中。",
      solutions: ["まず管理ツールを決める。", "その中で記録簿・メール・電話メモから対応事項を抽出する小機能を作る。"],
      progress: ["都市土木Cでコンプル試行中"]
    },
    p09: {
      feasibility: "◎",
      assessment: "AI向き",
      summary: "国交省の黒塗り方針に該当する場所を抽出できればAIが活きる。",
      detail: "個人情報、氏名、顔、重要種の確認位置が分かる文章・図面などを抽出し、黒塗り候補を示す。国交省の文章に沿って判定基準を作れるためAI活用テーマとして有望。現在の生成AIでも一部は実現できそう。",
      solutions: ["国交省の黒塗り方針を判定ルールに落とす。", "PDF・画像・図面の対象別に抽出し、人が承認して黒塗り化する。"],
      progress: ["最優先の技術支援テーマとして整理"]
    },
    p10: {
      feasibility: "○",
      assessment: "AIよりシステム開発",
      summary: "ArcGISで現場デジタル記録する方が本筋。AIよりシステム開発寄り。",
      detail: "紙の調査結果をスキャンしてGIS/Excel化するより、ArcGIS等で現場でデジタル記録する運用が自然。AIテーマというより記録システム・入力導線の設計が中心。",
      solutions: ["ArcGIS現場入力を前提に入力フォームを設計する。", "紙記録が残る場合のみOCR補助を検討する。"],
      progress: ["AIテーマからDX/システム開発テーマへ整理"]
    },
    p11: {
      feasibility: "◎",
      assessment: "p09へ統合",
      summary: "公開用成果物の黒塗り支援としてp09へ統合。",
      detail: "公開用成果物作成の負担軽減はAIが活かせる。氏名、顔、重要種位置、機微情報の墨消し候補抽出を中心に、p09のテーマへ統合する。",
      solutions: ["p09の黒塗り支援へ統合し、対象成果物ごとのデモを作る。"],
      progress: ["重複テーマとして統合整理"]
    },
    p12: {
      feasibility: "×",
      assessment: "優先度低",
      summary: "プロポ戦略室連携が必要。外販につながりにくく優先度低。",
      detail: "管理技術者・担当技術者の基礎点確認は営業支援色が強く、他社への売り込みにつながりにくい。プロポ戦略室との連携も必要なため、AI開発テーマとしての優先度は低い。",
      solutions: ["AIワークショップでは候補に残すが、技術支援系より後回しにする。"],
      progress: ["優先度低として整理"]
    },
    p13: {
      feasibility: "×",
      assessment: "社内制度・システム依存",
      summary: "会社の各システム連携が必要。AIテーマとしては優先度低。",
      detail: "人事制度改革の個人目標を定量評価で支援する案。会社の各システムとの連携が前提で、最後は人が確認する必要がある。外販性も低く、今回のAI体験テーマとしては優先度低。",
      solutions: ["社内制度・人事システム側の要件整理が先。"],
      progress: ["優先度低として整理"]
    },
    p14: {
      feasibility: "△",
      assessment: "タスク管理ツール同義",
      summary: "smartDBやZACのリマインドで足りる可能性が高い。",
      detail: "細かい注文書が多い民間案件の納期管理・精算漏れ防止。smartDBやZACが毎月仕入れ有無をリマインドすればよく、タスク管理ツールと同義の領域。",
      solutions: ["WonderWeb連携より先に既存システムのリマインド設定を確認する。", "AIは督促文や確認メモ生成など小機能に絞る。"],
      progress: ["業務管理ツール領域として整理"]
    },
    p15: {
      feasibility: "○",
      assessment: "集計システムで実現可",
      summary: "12時間後までの詳細メッシュ雨量を集計するシステムで実現可能。",
      detail: "連続雨量などから道路の事前通行規制を判定する。12時間後までの雨量は詳細メッシュデータが公表されているため、まずは集計システムの構築で対応できる。AIというより実装・自動化寄り。",
      solutions: ["詳細メッシュ雨量を取得・集計する。", "規制基準と照合し、判定と通知を出す。"],
      progress: ["時系列AIというよりDX自動化テーマとして整理"]
    },
    p16: {
      feasibility: "○",
      assessment: "既存AIあり",
      summary: "雨量と河川水位の波形データから将来水位を予測するAIは既にある。",
      detail: "タンクモデルや河川管理の雨量・水位相関AI。河川計画理論に沿ったAIではなく、雨量と河川水位の波形データから将来水位を予測するAIは既にある。中身の説明可能性は課題。",
      solutions: ["既存AIとの差分を整理する。", "ワークショップでは水位予測の見える化デモに寄せる。"],
      progress: ["既存技術ありとして位置づけ"]
    },
    p17: {
      feasibility: "△",
      assessment: "教師データ不足",
      summary: "3次元化は可能。酸化程度判定は画像解析で可能だが教師データ不足が課題。",
      detail: "コアを回転しながら写真撮影すれば3次元化はできる。酸化の程度の判定は画像解析で可能性があるが、教師データが不足すると思われる。過去件数と頻度の確認が必要。",
      solutions: ["過去件数と発生頻度を確認する。", "まずは写真から酸化程度を段階分類する小さな検証にする。"],
      progress: ["教師データ量の確認待ち"]
    },
    p18: {
      feasibility: "△",
      assessment: "単一写真では難しい",
      summary: "地形情報ベースなら0次谷AIで可能。現地単一写真での判定は難しい。",
      detail: "地すべりすべり面評価や擦痕解析は、地形情報をもとにしたものは0次谷AIでできる。現地の単一写真だけで判定するのは難しい。",
      solutions: ["地形情報と現地写真を分けて評価する。", "擦痕写真は専門家教師データがある場合だけ検討する。"],
      progress: ["地形AIとの関係を整理"]
    }
  };

  board.panels.forEach((panel) => {
    const review = reviews[panel.id];
    if (review) Object.assign(panel, review);
  });

  board.panels.push(
    boardPanel("p19", "営業支援系AIの優先度整理", "progress", 380, 840, ["sales"], "外販につながりにくいため、営業支援系AIは優先度低。", "営業支援系AIは本来のところで他社への売り込みにつながりにくい。ワークショップでは候補として見せつつ、優先順位は技術支援系や公開成果物黒塗りより下げる。", ["営業支援は生成AIの小さな業務支援デモに留める。", "PoC候補は技術支援系を中心に選ぶ。"], ["追加コメントを反映"], { feasibility: "低", assessment: "優先度低" }),
    boardPanel("p20", "粒径加積曲線の東亜建設事例", "detail", 1590, 890, ["chubu", "technical"], "どの事例か確認が必要。", "粒径加積曲線での東亜建設さんの事例について、具体的にどの件を指すか確認する。事例の利用可否は、権利関係と参照範囲を整理してから判断する。", ["対象事例を特定する。", "利用可能な公開情報か、社内参考に留めるか確認する。"], ["確認事項として保持"], { feasibility: "要確認", assessment: "事例確認" })
  );

  applyPanelDiscussionDefaults(board);
  applyPanelTagGroups(board);
  applyPanelAudienceDefaults(board);
  layoutBoardPanels(board);
  return board;
}

function boardPanel(id, title, stage, x, y, tags, summary, detail, solutions = [], progress = [], meta = {}) {
  const content = meta.content || detail || summary || "";
  return { id, title, stage, x, y, tags, content, summary, detail, solutions, progress, ...meta };
}

function normalizeBoardState(board) {
  const normalized = board || defaultBoard();
  let changed = false;
  let needsLayout = false;
  normalized.version = BOARD_VERSION;
  const defaultTagIds = new Set(defaultBoardTags.map((tag) => tag.id));
  const tagIds = Array.isArray(normalized.tags) ? normalized.tags.map((tag) => tag.id) : [];
  if (!Array.isArray(normalized.tags) || !normalized.tags.length || defaultBoardTags.some((tag) => !tagIds.includes(tag.id))) {
    normalized.tags = defaultBoardTags.map((tag) => ({ ...tag }));
    changed = true;
    needsLayout = true;
  }
  if (!Array.isArray(normalized.panels)) normalized.panels = [];
  normalized.panels.forEach((panel) => {
    let tagId = defaultPanelTags[panel.id] || legacyTagMap[panel.tag] || legacyTagMap[panel.tags?.[0]] || panelTagId(panel, normalized);
    if (!defaultTagIds.has(tagId)) tagId = panelAudience(panel) === BOARD_AUDIENCE_EXTERNAL ? "disaster-monitoring" : "business-ops";
    if (!panel.tag || !Array.isArray(panel.tags) || panel.tags[0] !== tagId) {
      panel.tag = tagId;
      panel.tags = [tagId];
      changed = true;
      needsLayout = true;
    }
    panel.content = panel.content || panel.detail || panel.summary || "";
    if (!panel.memo && Array.isArray(panel.progress) && panel.progress.length) {
      panel.memo = panel.progress.join("\n");
      changed = true;
    }
    if (![BOARD_AUDIENCE_INTERNAL, BOARD_AUDIENCE_EXTERNAL].includes(panel.audience)) {
      panel.audience = defaultAudienceForPanel(panel, normalized);
      needsLayout = true;
      changed = true;
    }
  });
  if (needsLayout) layoutBoardPanels(normalized);
  return { board: normalized, changed };
}

function applyPanelTagGroups(board) {
  board.panels.forEach((panel) => {
    const tagId = defaultPanelTags[panel.id] || panelTagId(panel, board) || defaultBoardTags[0].id;
    panel.tag = tagId;
    panel.tags = [tagId];
    panel.content = panel.content || panel.detail || panel.summary || "";
  });
}

function applyPanelAudienceDefaults(board) {
  board.panels.forEach((panel) => {
    panel.audience = defaultAudienceForPanel(panel, board);
  });
}

function applyPanelDiscussionDefaults(board) {
  board.panels.forEach((panel) => {
    const discussion = defaultPanelDiscussion[panel.id];
    if (!discussion) return;
    panel.solutions = discussion.solutions;
    panel.progress = discussion.notes;
  });
}

function layoutBoardPanels(board) {
  const counts = {};
  board.panels.forEach((panel) => {
    const tagId = panelTagId(panel, board);
    const audience = panelAudience(panel);
    const zone = boardTagZone(board, tagId, audience);
    const key = `${audience}:${tagId}`;
    const count = counts[key] || 0;
    panel.x = zone.x + (count % 2) * 292;
    panel.y = zone.y + Math.floor(count / 2) * 176;
    panel.w = panel.w || 274;
    panel.h = panel.h || 148;
    panel.audience = audience;
    counts[key] = count + 1;
  });
  return board;
}

function boardTagZone(board, tagId, audience = BOARD_AUDIENCE_INTERNAL) {
  const internalZones = {
    "proposal-sales": { x: 56, y: 135 },
    "business-ops": { x: 530, y: 135 },
    "public-redaction": { x: 530, y: 560 },
    "env-survey": { x: 56, y: 760 },
    "river-road": { x: 56, y: 1180 },
    "disaster-monitoring": { x: 530, y: 1180 },
    "geology-boring": { x: 56, y: 1600 }
  };
  const externalBase = BOARD_EXTERNAL_X;
  const externalZones = {
    "disaster-monitoring": { x: externalBase + 56, y: 135 },
    "river-road": { x: externalBase + 56, y: 640 },
    "geology-boring": { x: externalBase + 530, y: 640 },
    "public-redaction": { x: externalBase + 530, y: 135 },
    "env-survey": { x: externalBase + 56, y: 1080 },
    "proposal-sales": { x: externalBase + 530, y: 1080 },
    "business-ops": { x: externalBase + 56, y: 1480 }
  };
  const tagIndex = Math.max(0, board.tags.findIndex((tag) => tag.id === tagId));
  const fallbackX = audience === BOARD_AUDIENCE_EXTERNAL ? externalBase + 56 : 56;
  const fallbackY = 1320 + Math.floor(tagIndex / 2) * 420;
  return (audience === BOARD_AUDIENCE_EXTERNAL ? externalZones[tagId] : internalZones[tagId]) || { x: fallbackX + (tagIndex % 2) * 540, y: fallbackY };
}

function placePanelInTagGroup(board, panel) {
  const tagId = panelTagId(panel, board);
  const audience = panelAudience(panel);
  const zone = boardTagZone(board, tagId, audience);
  const index = board.panels.filter((item) => item.id !== panel.id && panelTagId(item, board) === tagId && panelAudience(item) === audience).length;
  panel.x = zone.x + (index % 2) * 292;
  panel.y = zone.y + Math.floor(index / 2) * 176;
}

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

function loadBoardState() {
  try {
    const saved = JSON.parse(localStorage.getItem("ox-ai-issue-board") || "null");
    if (saved?.tags?.length && saved?.panels?.length) return normalizeBoardState(saved).board;
  } catch {
    // Use the seeded board when local storage is unavailable or malformed.
  }
  return defaultBoard();
}

async function loadSharedBoard() {
  const localBoard = loadBoardState();
  try {
    const saved = await api("/api/board");
    if (saved.board?.tags?.length && saved.board?.panels?.length) {
      const normalized = normalizeBoardState(saved.board);
      state.board = normalized.board;
      state.boardUpdatedAt = saved.updatedAt || saved.board.updatedAt || "";
      localStorage.setItem("ox-ai-issue-board", JSON.stringify(state.board));
      if (normalized.changed && state.me?.authenticated) {
        const synced = await api("/api/board", {
          method: "PUT",
          body: JSON.stringify({ board: state.board })
        });
        state.boardUpdatedAt = synced.updatedAt || state.boardUpdatedAt;
      }
      return;
    }
    state.board = localBoard;
    saveBoardState({ remote: false });
    if (state.me?.authenticated) {
      const initial = await api("/api/board", {
        method: "PUT",
        body: JSON.stringify({ board: state.board })
      });
      state.boardUpdatedAt = initial.updatedAt || state.boardUpdatedAt;
    }
  } catch {
    state.board = localBoard;
  }
}

function saveBoardState(options = {}) {
  if (!state.board) return;
  state.board = normalizeBoardState(state.board).board;
  state.board.version = BOARD_VERSION;
  state.board.updatedAt = new Date().toISOString();
  state.boardUpdatedAt = state.board.updatedAt;
  localStorage.setItem("ox-ai-issue-board", JSON.stringify(state.board));
  if (options.remote === false || !state.me?.authenticated) return;
  queueBoardSave();
}

function queueBoardSave() {
  clearTimeout(state.boardSaveTimer);
  state.boardSaveTimer = setTimeout(async () => {
    try {
      const saved = await api("/api/board", {
        method: "PUT",
        body: JSON.stringify({ board: state.board })
      });
      state.boardUpdatedAt = saved.updatedAt || state.boardUpdatedAt;
    } catch {
      // Local changes remain in localStorage and will be retried on the next edit.
    }
  }, 350);
}

async function pollBoardUpdates() {
  if (state.boardModal || state.boardInteracting) return;
  try {
    const saved = await api("/api/board");
    if (!saved.board?.tags?.length || !saved.board?.panels?.length) return;
    const incoming = saved.updatedAt || saved.board.updatedAt || "";
    if (!incoming || incoming <= state.boardUpdatedAt) return;
    const normalized = normalizeBoardState(saved.board);
    state.board = normalized.board;
    state.boardUpdatedAt = incoming;
    localStorage.setItem("ox-ai-issue-board", JSON.stringify(state.board));
    if (normalized.changed) queueBoardSave();
    if (state.view === "board") renderApp();
  } catch {
    // Keep the local board usable when the shared endpoint is temporarily unavailable.
  }
}

async function heartbeatPresence() {
  try {
    const data = await api("/api/presence", { method: "POST", body: "{}" });
    state.presence = data.participants || [];
    if (state.view === "board" && !state.boardModal) renderPresenceOnly();
  } catch {
    state.presence = [];
  }
}

function startRealtimeSync() {
  stopRealtimeSync();
  heartbeatPresence();
  pollBoardUpdates();
  state.presencePoll = setInterval(heartbeatPresence, 5000);
  state.boardPoll = setInterval(pollBoardUpdates, 3500);
}

function stopRealtimeSync() {
  clearInterval(state.presencePoll);
  clearInterval(state.boardPoll);
  clearTimeout(state.boardSaveTimer);
  state.presencePoll = null;
  state.boardPoll = null;
  state.boardSaveTimer = null;
}

function renderPresenceOnly() {
  const target = document.querySelector("[data-presence]");
  if (target) target.innerHTML = presenceHtml();
}

function resetBoardState() {
  state.board = defaultBoard();
  state.boardModal = null;
  saveBoardState();
  renderApp();
}

function uid(prefix = "id") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function currentBoard() {
  if (!state.board) state.board = loadBoardState();
  return state.board;
}

function tagById(tagId) {
  return currentBoard().tags.find((tag) => tag.id === tagId);
}

function panelTagId(panel, board = currentBoard()) {
  return panel.tag || panel.tags?.[0] || board?.tags?.[0]?.id || defaultBoardTags[0].id;
}

function primaryTag(panel) {
  return tagById(panelTagId(panel));
}

function panelAudience(panel) {
  return panel?.audience === BOARD_AUDIENCE_EXTERNAL ? BOARD_AUDIENCE_EXTERNAL : BOARD_AUDIENCE_INTERNAL;
}

function boardAudienceFromX(x) {
  return Number(x || 0) >= BOARD_AUDIENCE_SWITCH_X ? BOARD_AUDIENCE_EXTERNAL : BOARD_AUDIENCE_INTERNAL;
}

function audienceLabel(audience) {
  return boardAudienceLabels[panelAudience({ audience })]?.label || boardAudienceLabels[BOARD_AUDIENCE_INTERNAL].label;
}

function panelMemoText(panel) {
  if (typeof panel?.memo === "string") return panel.memo;
  if (Array.isArray(panel?.progress)) return panel.progress.join("\n");
  return "";
}

function defaultAudienceForPanel(panel, board = currentBoard()) {
  if (defaultPanelAudience[panel.id]) return defaultPanelAudience[panel.id];
  const tagId = panelTagId(panel, board);
  if (["disaster-monitoring", "river-road", "geology-boring"].includes(tagId)) return BOARD_AUDIENCE_EXTERNAL;
  return BOARD_AUDIENCE_INTERNAL;
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
  state.view = archiveMatch || location.hash === "#app-create" ? "app-create" : "board";
  if (archiveMatch) {
    state.builderStage = "archive";
    if (archiveMatch[1]) state.activeProjectId = archiveMatch[1];
  }
  if (!me.authenticated) {
    renderLogin();
    return;
  }
  await loadWorkspace();
  await loadSharedBoard();
  startRealtimeSync();
  renderApp();
}

function renderLogin() {
  app.innerHTML = html`
    <section class="login-screen">
      <div class="login-copy">
        <p class="eyebrow">OX Workshop</p>
        <h1>OX Workshop</h1>
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
      state.me = await api("/api/me");
      await loadWorkspace();
      await loadSharedBoard();
      startRealtimeSync();
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
        <button class="brand brand-button" type="button" data-view="board" title="アイデアボードに戻る" aria-label="アイデアボードに戻る">
          <div class="mark">OX</div>
          <div>
            <strong>OX Workshop</strong>
            <span>${escapeHtml(navSubtitle())}</span>
          </div>
        </button>
        <div class="nav-tabs">
          ${tabButton("board", "アイデアボード")}
          ${tabButton("app-create", "AIアプリ体験")}
        </div>
        <div class="nav-actions">
          ${renderNavActions()}
          <button class="ghost" id="logoutBtn">ログアウト</button>
        </div>
      </nav>
      <div class="shell" id="view"></div>
    </section>`;

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    stopRealtimeSync();
    await api("/api/logout", { method: "POST", body: "{}" });
    renderLogin();
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      if (state.view === "app-create") state.builderStage = "select";
      const hash = state.view === "app-create" ? "#app-create" : "#board";
      history.replaceState(null, "", hash);
      renderApp();
    });
  });
  renderCurrentView();
  wireBoardNavActions();
}

function tabButton(id, label) {
  return `<button data-view="${id}" class="${state.view === id ? "active" : ""}">${label}</button>`;
}

function navSubtitle() {
  if (state.view === "app-create") return "AIアプリ体験";
  return "アイデアボード";
}

function renderNavActions() {
  if (state.view !== "board") return "";
  return html`
    <div class="presence-bar" data-presence>${presenceHtml()}</div>
    <button type="button" data-board-add>＋ 課題を追加</button>
    <button type="button" class="ghost" data-board-tags>タグ編集</button>
    <button type="button" class="ghost" data-board-layout>整列</button>`;
}

function wireBoardNavActions() {
  if (state.view !== "board") return;
  document.querySelector("[data-board-layout]")?.addEventListener("click", () => {
    if (!confirm("現在の配置をタグごとに整列します。手動で動かした位置も更新されます。実行しますか？")) return;
    autoLayoutBoard();
  });
  document.querySelector("[data-board-add]")?.addEventListener("click", addBoardPanelFromButton);
  document.querySelector("[data-board-tags]")?.addEventListener("click", () => {
    state.boardModal = { tagsOnly: true };
    renderApp();
  });
}

function renderCurrentView() {
  const view = document.getElementById("view");
  if (state.view === "app-create") return renderBuilder(view);
  renderIssueBoard(view);
}

function renderIssueBoard(container) {
  const board = currentBoard();
  container.innerHTML = html`
    <section class="issue-board-shell">
      <div class="board-workspace">
        <div class="mindmap-board" data-board-scroll>
          <div class="board-canvas" data-board-canvas style="${boardCanvasStyle(board)}">
            ${renderBoardLanes(board)}
            ${renderBoardRegions(board)}
            ${board.panels.map(renderBoardCard).join("")}
          </div>
        </div>
      </div>
    </section>
    ${state.boardModal ? renderBoardModal() : ""}`;

  wireBoard(container);
}

function boardCanvasStyle(board) {
  const panels = board?.panels || [];
  const right = panels.reduce((max, panel) => Math.max(max, boardDisplayX(panel.x) + panelWidth(panel)), 0);
  const bottom = panels.reduce((max, panel) => Math.max(max, boardDisplayY(panel.y) + panelHeight(panel)), 0);
  const laneRight = boardDisplayX(BOARD_EXTERNAL_X + BOARD_AUDIENCE_LANE_WIDTH + 220);
  const width = Math.max(3200, laneRight, right + BOARD_VIEW_PADDING);
  const height = Math.max(2200, bottom + BOARD_VIEW_PADDING);
  return `width:${width}px; height:${height}px;`;
}

function boardDisplayX(value) {
  return Number(value || 0) + BOARD_VIEW_PADDING;
}

function boardDisplayY(value) {
  return Number(value || 0) + BOARD_VIEW_PADDING;
}

function boardLaneHeight(board) {
  const panels = board?.panels || [];
  const bottom = panels.reduce((max, panel) => Math.max(max, Number(panel.y || 0) + panelHeight(panel)), BOARD_LANE_TOP + 1100);
  return Math.max(1450, bottom - BOARD_LANE_TOP + 420);
}

function renderBoardLanes(board) {
  const height = boardLaneHeight(board);
  const internalLeft = boardDisplayX(BOARD_MIN_COORD) - 10;
  const internalTop = boardDisplayY(BOARD_LANE_TOP) - 58;
  const splitLeft = boardDisplayX(BOARD_AUDIENCE_SWITCH_X);
  const internalWidth = splitLeft - internalLeft - 8;
  const externalLeft = splitLeft + 8;
  const externalWidth = boardDisplayX(BOARD_EXTERNAL_X + BOARD_AUDIENCE_LANE_WIDTH + 220) - externalLeft;
  const headingTop = boardDisplayY(BOARD_LANE_TOP) - 78;
  return html`
    <section class="audience-lane internal" style="left:${internalLeft}px; top:${internalTop}px; width:${internalWidth}px; height:${height}px;">
    </section>
    <section class="audience-lane external" style="left:${externalLeft}px; top:${internalTop}px; width:${externalWidth}px; height:${height}px;">
    </section>
    <div class="audience-heading internal" style="left:${boardDisplayX(0)}px; top:${headingTop}px;">
      <span>${boardAudienceLabels[BOARD_AUDIENCE_INTERNAL].label}</span>
      <small>${boardAudienceLabels[BOARD_AUDIENCE_INTERNAL].description}</small>
    </div>
    <div class="audience-heading external" style="left:${boardDisplayX(BOARD_EXTERNAL_X)}px; top:${headingTop}px;">
      <span>${boardAudienceLabels[BOARD_AUDIENCE_EXTERNAL].label}</span>
      <small>${boardAudienceLabels[BOARD_AUDIENCE_EXTERNAL].description}</small>
    </div>`;
}

function presenceHtml() {
  const participants = state.presence || [];
  const shown = participants.slice(0, 8);
  if (!shown.length) return `<span class="presence-label">参加中</span><span class="presence-empty">0名</span>`;
  return html`
    <span class="presence-label">参加中</span>
    <span class="presence-count">${participants.length}名</span>
    <span class="presence-avatars">
      ${shown.map((person) => `
        <span class="presence-avatar ${person.self ? "self" : ""}" style="--presence-color:${escapeHtml(person.color || "#64748b")}" title="${escapeHtml(person.name)}">
          ${escapeHtml(person.name.replace(/^参加者\s*/, "").slice(0, 2) || "人")}
        </span>`).join("")}
      ${participants.length > shown.length ? `<span class="presence-more">+${participants.length - shown.length}</span>` : ""}
    </span>`;
}

function renderBoardCard(panel) {
  const tag = primaryTag(panel);
  const color = tag?.color || "#9aa6b2";
  const audience = panelAudience(panel);
  const width = panelWidth(panel);
  const height = panelHeight(panel);
  const content = panel.content || panel.detail || panel.summary || "内容を入力してください。";
  return html`
    <article class="board-card" data-board-card="${escapeHtml(panel.id)}" data-audience="${audience}" style="left:${boardDisplayX(panel.x)}px; top:${boardDisplayY(panel.y)}px; width:${width}px; min-height:${height}px; --card-color:${escapeHtml(color)};">
      <div class="board-card-top">
        <span class="stage-badge">${escapeHtml(tag?.name || "未分類")}</span>
        <span class="audience-badge ${audience}">${escapeHtml(audienceLabel(audience))}</span>
        <span class="tag-dot" aria-hidden="true"></span>
      </div>
      <h2>${escapeHtml(panel.title)}</h2>
      <p>${escapeHtml(content)}</p>
      <span class="board-resize-handle" data-board-resize="${escapeHtml(panel.id)}" aria-hidden="true"></span>
    </article>`;
}

function renderBoardRegions(board) {
  const groups = [];
  [BOARD_AUDIENCE_INTERNAL, BOARD_AUDIENCE_EXTERNAL].forEach((audience) => {
    board.tags.forEach((tag) => groups.push({ audience, tag }));
  });
  return groups.map(({ audience, tag }) => {
    const panels = board.panels.filter((panel) => panelAudience(panel) === audience && panelTagId(panel, board) === tag.id);
    if (!panels.length) return "";
    const left = Math.min(...panels.map((panel) => boardDisplayX(panel.x))) - 28;
    const top = Math.min(...panels.map((panel) => boardDisplayY(panel.y))) - 42;
    const right = Math.max(...panels.map((panel) => boardDisplayX(panel.x) + panelWidth(panel))) + 28;
    const bottom = Math.max(...panels.map((panel) => boardDisplayY(panel.y) + panelHeight(panel))) + 34;
    return html`
      <section class="tag-region" style="left:${left}px; top:${top}px; width:${right - left}px; height:${bottom - top}px; --tag-color:${escapeHtml(tag.color)};">
        <span>${escapeHtml(tag.name)}</span>
      </section>`;
  }).join("");
}

function renderBoardModal() {
  if (state.boardModal?.tagsOnly) return renderTagManagerModal();
  const isDraft = Boolean(state.boardModal?.draft);
  const panel = isDraft ? state.boardModal.panel : currentBoard().panels.find((item) => item.id === state.boardModal.panelId);
  if (!panel) return "";
  const content = panel.content || panel.detail || panel.summary || "";
  const memo = panelMemoText(panel);
  const tagOptions = currentBoard().tags
    .map((tag) => `<option value="${escapeHtml(tag.id)}" ${panelTagId(panel) === tag.id ? "selected" : ""}>${escapeHtml(tag.name)}</option>`)
    .join("");
  const audienceOptions = [BOARD_AUDIENCE_INTERNAL, BOARD_AUDIENCE_EXTERNAL]
    .map((audience) => `<option value="${audience}" ${panelAudience(panel) === audience ? "selected" : ""}>${escapeHtml(boardAudienceLabels[audience].label)}</option>`)
    .join("");
  return html`
    <div class="board-modal-backdrop" data-board-close>
      <section class="board-modal" role="dialog" aria-modal="true" aria-label="課題パネル編集">
        <form id="boardPanelForm">
          <div class="modal-head">
            <div>
              <p class="eyebrow">${isDraft ? "課題を追加" : "パネル編集"}</p>
              <h2>${escapeHtml(panel.title || "新しい課題")}</h2>
            </div>
            <button type="button" class="ghost" data-board-close-button>閉じる</button>
          </div>
          <div class="modal-grid">
            <div class="modal-main-fields">
              <label class="field">
                <span>名称</span>
                <input name="title" value="${escapeHtml(panel.title)}">
              </label>
              <label class="field">
                <span>タグ</span>
                <select name="tag">${tagOptions}</select>
              </label>
              <label class="field">
                <span>属性</span>
                <select name="audience">${audienceOptions}</select>
              </label>
              <label class="field">
                <span>内容</span>
                <textarea name="content">${escapeHtml(content)}</textarea>
              </label>
              <label class="field">
                <span>メモ</span>
                <textarea name="memo">${escapeHtml(memo)}</textarea>
              </label>
            </div>
          </div>

          <div class="modal-actions">
            ${isDraft ? "<span></span>" : "<button type=\"button\" class=\"danger\" data-delete-panel>削除</button>"}
            <button type="submit">${isDraft ? "追加" : "保存"}</button>
          </div>
        </form>
      </section>
    </div>`;
}

function listInput(type, value, index) {
  const label = type === "solution" ? "解決方針案" : "メモ";
  return html`
    <div class="modal-list-row">
      <textarea name="${type}-${index}" aria-label="${label}${index + 1}">${escapeHtml(value)}</textarea>
      <button type="button" class="danger" data-list-delete="${type}" data-list-index="${index}">削除</button>
    </div>`;
}

function renderTagManagerModal() {
  const tags = currentBoard().tags;
  return html`
    <div class="board-modal-backdrop" data-board-close>
      <section class="board-modal tag-modal" role="dialog" aria-modal="true" aria-label="タグ編集">
        <div class="modal-head">
          <div>
            <p class="eyebrow">タグ編集</p>
            <h2>グルーピングを調整する</h2>
          </div>
          <button type="button" class="ghost" data-board-close-button>閉じる</button>
        </div>
        <div class="tag-editor-list">
          ${tags.map((tag) => `
            <div class="tag-editor-row" data-tag-row="${escapeHtml(tag.id)}">
              <input data-tag-name="${escapeHtml(tag.id)}" value="${escapeHtml(tag.name)}" aria-label="タグ名">
              <input data-tag-color="${escapeHtml(tag.id)}" type="color" value="${escapeHtml(tag.color)}" aria-label="タグ色">
              <button type="button" class="danger" data-tag-delete="${escapeHtml(tag.id)}" ${tags.length <= 1 ? "disabled" : ""}>削除</button>
            </div>`).join("")}
        </div>
        <div class="modal-actions">
          <button type="button" class="secondary" data-tag-add>タグを追加</button>
          <button type="button" data-board-close-button>完了</button>
        </div>
      </section>
    </div>`;
}

function wireBoard(container) {
  container.querySelector("[data-board-layout]")?.addEventListener("click", () => {
    if (!confirm("現在の配置をタグごとに整列します。手動で動かした位置も更新されます。実行しますか？")) return;
    autoLayoutBoard();
  });
  container.querySelector("[data-board-add]")?.addEventListener("click", addBoardPanelFromButton);
  container.querySelector("[data-board-tags]")?.addEventListener("click", () => {
    state.boardModal = { tagsOnly: true };
    renderApp();
  });
  wireBoardCanvas(container);
  wireBoardModal(container);
}

function startBuilderMode(aiType) {
  state.aiType = aiType;
  state.view = "app-create";
  state.builderStage = "configure";
  if (state.aiType === "specialized" && state.selectedTemplates.size === 0) {
    state.selectedTemplates.add("slope-monitoring");
  }
  renderApp();
}

function wireBoardCanvas(container) {
  const canvas = container.querySelector("[data-board-canvas]");
  const scroller = container.querySelector("[data-board-scroll]");
  if (!canvas) return;
  if (scroller) {
    const initialLeft = Math.round((BOARD_VIEW_PADDING - 22) * BOARD_RENDER_ZOOM);
    const initialTop = Math.round((BOARD_VIEW_PADDING - 46) * BOARD_RENDER_ZOOM);
    scroller.scrollLeft = Number.isFinite(state.boardScrollLeft) ? state.boardScrollLeft : initialLeft;
    scroller.scrollTop = Number.isFinite(state.boardScrollTop) ? state.boardScrollTop : initialTop;
    state.boardScrollLeft = scroller.scrollLeft;
    state.boardScrollTop = scroller.scrollTop;
    scroller.addEventListener("scroll", () => {
      state.boardScrollLeft = scroller.scrollLeft;
      state.boardScrollTop = scroller.scrollTop;
    }, { passive: true });
  }
  let panStart = null;
  canvas.addEventListener("pointerdown", (event) => {
    if (event.target.closest("[data-board-card]")) return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    panStart = {
      x: event.clientX,
      y: event.clientY,
      left: scroller?.scrollLeft || 0,
      top: scroller?.scrollTop || 0
    };
    state.boardInteracting = true;
    scroller?.classList.add("panning");
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!panStart || !scroller) return;
    scroller.scrollLeft = panStart.left - (event.clientX - panStart.x);
    scroller.scrollTop = panStart.top - (event.clientY - panStart.y);
    state.boardScrollLeft = scroller.scrollLeft;
    state.boardScrollTop = scroller.scrollTop;
  });
  canvas.addEventListener("pointerup", () => {
    if (!panStart) return;
    panStart = null;
    state.boardInteracting = false;
    scroller?.classList.remove("panning");
  });
  canvas.addEventListener("pointercancel", () => {
    panStart = null;
    state.boardInteracting = false;
    scroller?.classList.remove("panning");
  });
  container.querySelectorAll("[data-board-card]").forEach((card) => {
    const panel = currentBoard().panels.find((item) => item.id === card.dataset.boardCard);
    if (!panel) return;
    let start = null;
    card.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      card.setPointerCapture?.(event.pointerId);
      const resizing = Boolean(event.target.closest("[data-board-resize]"));
      const scale = card.getBoundingClientRect().width / Math.max(1, panelWidth(panel));
      start = {
        mode: resizing ? "resize" : "move",
        x: event.clientX,
        y: event.clientY,
        panelX: panel.x,
        panelY: panel.y,
        width: panelWidth(panel),
        height: panelHeight(panel),
        scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
        moved: false
      };
      state.boardInteracting = true;
      card.classList.add(resizing ? "resizing" : "dragging");
    });
    card.addEventListener("pointermove", (event) => {
      if (!start) return;
      const dx = (event.clientX - start.x) / start.scale;
      const dy = (event.clientY - start.y) / start.scale;
      if (Math.abs(dx) + Math.abs(dy) > 5) start.moved = true;
      if (start.mode === "resize") {
        panel.w = Math.max(230, Math.min(540, Math.round(start.width + dx)));
        panel.h = Math.max(135, Math.min(440, Math.round(start.height + dy)));
        card.style.width = `${panel.w}px`;
        card.style.minHeight = `${panel.h}px`;
      } else {
        panel.x = Math.max(BOARD_MIN_COORD, Math.round(start.panelX + dx));
        panel.y = Math.max(BOARD_MIN_COORD, Math.round(start.panelY + dy));
        panel.audience = boardAudienceFromX(panel.x + panelWidth(panel) / 2);
        card.style.left = `${boardDisplayX(panel.x)}px`;
        card.style.top = `${boardDisplayY(panel.y)}px`;
        card.dataset.audience = panel.audience;
        const badge = card.querySelector(".audience-badge");
        if (badge) {
          badge.textContent = audienceLabel(panel.audience);
          badge.className = `audience-badge ${panel.audience}`;
        }
      }
    });
    card.addEventListener("pointerup", () => {
      if (!start) return;
      card.classList.remove("dragging");
      card.classList.remove("resizing");
      if (start.moved || start.mode === "resize") {
        saveBoardState();
        renderApp();
      } else if (start.mode === "move") {
        state.boardModal = { panelId: panel.id };
        renderApp();
      }
      state.boardInteracting = false;
      start = null;
    });
  });
}

function wireBoardModal(container) {
  const modal = container.querySelector(".board-modal-backdrop");
  if (!modal) return;
  modal.addEventListener("click", (event) => {
    if (event.target === modal || event.target.closest("[data-board-close-button]")) {
      state.boardModal = null;
      renderApp();
    }
  });
  modal.querySelector("[data-add-solution]")?.addEventListener("click", () => mutateBoardPanelList("solutions", "新しい解決方針案"));
  modal.querySelector("[data-add-progress]")?.addEventListener("click", () => mutateBoardPanelList("progress", "新しいメモ"));
  modal.querySelectorAll("[data-list-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      const field = button.dataset.listDelete === "solution" ? "solutions" : "progress";
      const panel = currentBoard().panels.find((item) => item.id === state.boardModal?.panelId);
      if (!panel) return;
      panel[field] = (panel[field] || []).filter((_, index) => index !== Number(button.dataset.listIndex));
      saveBoardState();
      renderApp();
    });
  });
  modal.querySelector("[data-delete-panel]")?.addEventListener("click", () => {
    const id = state.boardModal?.panelId;
    currentBoard().panels = currentBoard().panels.filter((panel) => panel.id !== id);
    state.boardModal = null;
    saveBoardState();
    renderApp();
  });
  modal.querySelector("#boardPanelForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveBoardPanelForm(event.currentTarget);
  });
  modal.querySelector("[data-tag-add]")?.addEventListener("click", () => {
    currentBoard().tags.push({ id: uid("tag"), name: "新しいタグ", color: "#64748b" });
    saveBoardState();
    renderApp();
  });
  modal.querySelectorAll("[data-tag-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.tagDelete;
      if (currentBoard().tags.length <= 1) return;
      currentBoard().tags = currentBoard().tags.filter((tag) => tag.id !== id);
      const fallbackTag = currentBoard().tags[0]?.id || defaultBoardTags[0].id;
      currentBoard().panels.forEach((panel) => {
        if (panelTagId(panel) === id) {
          panel.tag = fallbackTag;
          panel.tags = [fallbackTag];
        }
      });
      saveBoardState();
      renderApp();
    });
  });
  modal.querySelectorAll("[data-tag-name], [data-tag-color]").forEach((input) => {
    input.addEventListener("input", () => {
      const id = input.dataset.tagName || input.dataset.tagColor;
      const tag = tagById(id);
      if (!tag) return;
      if (input.dataset.tagName) tag.name = input.value;
      if (input.dataset.tagColor) tag.color = input.value;
      saveBoardState();
    });
  });
}

function saveBoardPanelForm(form) {
  const isDraft = Boolean(state.boardModal?.draft);
  const panel = isDraft ? state.boardModal.panel : currentBoard().panels.find((item) => item.id === state.boardModal?.panelId);
  if (!panel) return;
  const data = new FormData(form);
  const previousTag = panelTagId(panel);
  const previousAudience = panelAudience(panel);
  panel.title = String(data.get("title") || "新しい課題").trim();
  const content = String(data.get("content") || "").trim();
  const tagId = String(data.get("tag") || currentBoard().tags[0]?.id || defaultBoardTags[0].id);
  const audience = String(data.get("audience") || previousAudience);
  const memo = String(data.get("memo") || "").trim();
  panel.tag = tagId;
  panel.tags = [tagId];
  panel.audience = audience === BOARD_AUDIENCE_EXTERNAL ? BOARD_AUDIENCE_EXTERNAL : BOARD_AUDIENCE_INTERNAL;
  panel.content = content;
  panel.summary = content;
  panel.detail = content;
  panel.memo = memo;
  panel.progress = memo ? [memo] : [];
  if (isDraft) {
    placePanelInTagGroup(currentBoard(), panel);
    currentBoard().panels.push(panel);
  } else if (previousTag !== tagId || previousAudience !== panel.audience) {
    placePanelInTagGroup(currentBoard(), panel);
  }
  saveBoardState();
  state.boardModal = null;
  renderApp();
}

function mutateBoardPanelList(field, fallback) {
  const panel = currentBoard().panels.find((item) => item.id === state.boardModal?.panelId);
  if (!panel) return;
  panel[field] = [...(panel[field] || []), fallback];
  saveBoardState();
  renderApp();
}

function addBoardPanelAt(x, y) {
  const tagId = currentBoard().tags[0]?.id || defaultBoardTags[0].id;
  const panel = boardPanel(uid("panel"), "新しい課題", "issue", x, y, [tagId], "", "", [], [], { tag: tagId, audience: boardAudienceFromX(x + 137), w: 274, h: 148, memo: "" });
  state.boardModal = { draft: true, panel };
  renderApp();
}

function addBoardPanelFromButton() {
  const scroller = document.querySelector("[data-board-scroll]");
  const x = Math.max(BOARD_MIN_COORD, Math.round((scroller?.scrollLeft || state.boardScrollLeft || BOARD_VIEW_PADDING) - BOARD_VIEW_PADDING + 120));
  const y = Math.max(BOARD_MIN_COORD, Math.round((scroller?.scrollTop || state.boardScrollTop || BOARD_VIEW_PADDING) - BOARD_VIEW_PADDING + 120));
  addBoardPanelAt(x, y);
}

function panelWidth(panel) {
  return Math.max(230, Math.min(540, Number(panel.w || 300)));
}

function panelHeight(panel) {
  return Math.max(135, Math.min(440, Number(panel.h || 155)));
}

function autoLayoutBoard() {
  layoutBoardPanels(currentBoard());
  saveBoardState();
  renderApp();
}

function boardPanelPrompt(panel) {
  const tags = (panel.tags || []).map((tagId) => tagById(tagId)?.name).filter(Boolean).join("、") || "未分類";
  const memo = panelMemoText(panel);
  return `${panel.title}

属性: ${audienceLabel(panelAudience(panel))}
タグ: ${tags}

内容:
${panel.content || panel.detail || panel.summary || "内容未入力"}

メモ:
${memo || "未入力"}

この内容から、ワークショップで触れるAIアプリの完成画面まで作成してください。`;
}

function renderBuilder(container) {
  if (state.builderStage === "archive") return renderArchive(container);
  const configure = state.builderStage === "configure";
  if (!configure) {
    container.innerHTML = html`
      <header class="page-head compact-head">
        <div>
          <p class="eyebrow">AIアプリ体験</p>
          <h1>体験する内容を選ぶ</h1>
        </div>
        <button type="button" class="secondary" data-builder-archive>作成済みアプリ</button>
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
        <button class="mode-card featured" type="button" data-ai-type="consultation">
          <span>データなしで相談</span>
          <h2>相談から作る</h2>
          <p>相談内容から簡易モックを作り、完成画面まで進めます。</p>
        </button>
      </section>`;
    document.querySelectorAll("[data-ai-type]").forEach((button) => {
      button.addEventListener("click", () => startBuilderMode(button.dataset.aiType));
    });
    document.querySelector("[data-builder-archive]")?.addEventListener("click", () => {
      state.builderStage = "archive";
      history.replaceState(null, "", "#archive");
      renderApp();
    });
    return;
  }

  const modeTitle = {
    specialized: "特化型AI開発",
    generative: "生成AI活用",
    consultation: "相談から作る"
  }[state.aiType] || "アプリ作成";
  const submitLabel = {
    specialized: "完成アプリを生成",
    generative: "完成画面を生成",
    consultation: "相談からデモを生成"
  }[state.aiType] || "生成";
  const formBody = state.aiType === "specialized"
    ? specializedForm()
    : state.aiType === "generative"
      ? generativeForm()
      : consultationForm();

  container.innerHTML = html`
    <header class="page-head with-back">
      <button type="button" class="back-button" data-builder-back>← AIアプリ体験へ戻る</button>
      <div>
        <p class="eyebrow">AIアプリ体験</p>
        <h1>${modeTitle}</h1>
      </div>
    </header>

    <section class="builder-grid builder-grid-single">
      <form class="panel" id="projectForm">
        ${formBody}
        <div class="actions">
          <button type="submit" id="submitBtn" ${state.aiType === "specialized" && state.specializedStep < 4 ? "disabled" : ""}>${submitLabel}</button>
        </div>
        <div id="jobArea"></div>
      </form>
    </section>`;
  document.querySelectorAll("[data-builder-back]").forEach((button) => {
    button.addEventListener("click", () => {
      state.builderStage = "select";
      state.view = "app-create";
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
      const frameIndex = Number(button.dataset.annotationFrame || 0);
      const key = annotationKey(templateId, frameIndex);
      const boxes = state.annotationBoxes[key] || [];
      state.annotationBoxes[key] = boxes.slice(0, -1);
      state.annotationAccepted[key] = state.annotationBoxes[key].length > 0;
      renderApp();
    });
  });
  document.querySelectorAll("[data-annotation-clear]").forEach((button) => {
    button.addEventListener("click", () => {
      const templateId = button.dataset.annotationClear;
      const frameIndex = Number(button.dataset.annotationFrame || 0);
      const key = annotationKey(templateId, frameIndex);
      state.annotationBoxes[key] = [];
      state.annotationAccepted[key] = false;
      state.maskAdjustment[key] = 0;
      renderApp();
    });
  });
  document.querySelectorAll("[data-suggest-mask]").forEach((button) => {
    button.addEventListener("click", () => {
      const templateId = button.dataset.suggestMask;
      const frameIndex = Number(button.dataset.annotationFrame || 0);
      const key = annotationKey(templateId, frameIndex);
      state.annotationBoxes[key] = assistedMaskStrokes(templateId, frameIndex);
      state.annotationAccepted[key] = true;
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
      const prompt = document.querySelector("[data-generative-prompt]");
      const title = document.querySelector("[data-generative-title]");
      const input = document.querySelector("[data-generative-input]");
      const output = document.querySelector("[data-generative-output]");
      const kind = document.querySelector("[data-generative-kind]");
      if (prompt) prompt.value = button.dataset.example || "";
      if (title) title.value = button.dataset.exampleTitle || "";
      if (input) input.value = button.dataset.exampleInput || "";
      if (output) output.value = button.dataset.exampleOutput || "";
      if (kind) kind.value = button.dataset.exampleKind || "";
      document.querySelectorAll("[data-example]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      if (button.dataset.exampleFree === "true" && prompt) prompt.focus();
    });
  });
  document.querySelectorAll("[data-consult-type]").forEach((button) => {
    button.addEventListener("click", () => {
      state.consultType = button.dataset.consultType;
      const next = consultationScenarios.find((item) => item.type === state.consultType);
      if (next) state.consultScenario = next.id;
      if (next) state.consultText = next.prompt || "";
      renderApp();
    });
  });
  document.querySelectorAll("[data-consult-scenario]").forEach((button) => {
    button.addEventListener("click", () => {
      const scenario = consultationScenarios.find((item) => item.id === button.dataset.consultScenario);
      if (!scenario) return;
      state.consultScenario = scenario.id;
      state.consultType = scenario.type;
      state.consultText = scenario.prompt || "";
      renderApp();
    });
  });
  document.querySelectorAll("[data-consultation-input]").forEach((textarea) => {
    textarea.addEventListener("input", () => {
      state.consultText = textarea.value;
      const plan = inferConsultPlan(state.consultText, state.consultType, currentConsultScenario());
      const target = document.getElementById("consultPlan");
      if (target) target.innerHTML = consultationPlanHtml(plan);
    });
  });
  document.querySelectorAll(".drop-zone").forEach((zone) => {
    const input = zone.querySelector("input[type='file']");
    const label = zone.querySelector("[data-file-label]");
    const updateLabel = () => {
      const count = input?.files?.length || state.stagedFiles.length || 0;
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
        state.stagedFiles = Array.from(event.dataTransfer.files);
        updateLabel();
      }
    });
    input?.addEventListener("change", () => {
      state.stagedFiles = Array.from(input.files || []);
      updateLabel();
    });
    updateLabel();
  });
  document.getElementById("projectForm").addEventListener("submit", submitProject);
}

function wireAnnotationCanvas() {
  const canvas = document.querySelector("[data-annotation-canvas]");
  if (!canvas) return;
  const templateId = canvas.dataset.annotationCanvas;
  const frameIndex = Number(canvas.dataset.annotationFrame || 0);
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
    const key = annotationKey(templateId, frameIndex);
    const boxes = state.annotationBoxes[key] || [];
    state.annotationBoxes[key] = boxes.concat(stroke).slice(-8);
    state.annotationAccepted[key] = true;
    stroke = null;
    renderApp();
  });
  canvas.addEventListener("pointercancel", () => {
    stroke = null;
    renderApp();
  });
}

function annotationBox(templateId) {
  return (annotationBoxes(templateId) || [])[0] || null;
}

function annotationKey(templateId, frameIndex) {
  return `${templateId}:${Number(frameIndex) || 0}`;
}

function annotationTeacherFrames(templateId) {
  if (templateId === "inspection-damage") return [1, 3, 5];
  if (templateId === "slope-monitoring") return [2, 3, 5];
  if (templateId === "river-monitoring") return [2, 3, 5];
  return [0];
}

function annotationBoxes(templateId, frameIndex) {
  if (Number.isFinite(frameIndex)) {
    return state.annotationBoxes[annotationKey(templateId, frameIndex)] || [];
  }
  const prefix = `${templateId}:`;
  const grouped = Object.entries(state.annotationBoxes)
    .filter(([key]) => key.startsWith(prefix))
    .flatMap(([, value]) => value || []);
  return grouped.length ? grouped : state.annotationBoxes[templateId] || [];
}

function annotatedFrameCount(templateId) {
  return annotationTeacherFrames(templateId)
    .filter((frameIndex) => annotationBoxes(templateId, frameIndex).length > 0)
    .length;
}

function requiredAnnotationCount(templateId) {
  return imageTemplate(templateId) ? 2 : 0;
}

function assistedMaskStrokes(templateId, frameIndex) {
  return segmentationPaths(templateId, frameIndex).map((item) => ({
    type: item.kind === "line" ? "line" : "area",
    d: item.d,
    width: templateId === "inspection-damage" ? 9 : 28,
    closed: item.kind !== "line",
    assisted: true
  }));
}

function specializedAnnotationSummary(templateId) {
  if (!imageTemplate(templateId)) {
    const decision = timeSeriesDecision();
    return [
      `データセット: ${state.tsDataset}`,
      `目的: ${state.tsGoal === "anomaly" ? "異常検知" : "推移予測"}`,
      `警戒ライン: ${decision.threshold.toFixed(2)}`,
      `現在判定: ${decision.risk}`
    ].join("\n");
  }
  const frames = annotationTeacherFrames(templateId);
  return frames.map((frameIndex) => {
    const count = annotationBoxes(templateId, frameIndex).length;
    const frame = imageFrameData(templateId, frameIndex);
    return `${frame?.label || `サンプル${frameIndex + 1}`}: ${count ? "アノテーション済み" : "未作成"}`;
  }).join("\n");
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
    const d = stroke.d || (stroke.points ? pathFromPoints(stroke.points, !!stroke.closed) : annotationPathFromLegacyRect(stroke));
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
      <label class="drop-zone compact-drop">
        <input type="file" name="files" multiple accept=".jpg,.jpeg,.png,.csv,.txt,.pdf">
        <strong data-file-label>${state.stagedFiles.length ? `${state.stagedFiles.length}件のファイルを追加済み` : "参考画像・CSVを追加"}</strong>
        <span>手元データがない場合はデフォルトデータで進みます</span>
      </label>
      <label class="field">
        <span>追加したい画面・機能</span>
        <textarea name="instruction" placeholder="例：警戒レベルの根拠、担当者メモ、自治体向け速報文を入れたい。"></textarea>
      </label>
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
  const decision = timeSeriesDecision();
  const hasImages = imageTemplate(template.id);
  const step = Math.max(1, Math.min(4, state.specializedStep || 1));
  const teacherFrames = annotationTeacherFrames(template.id);
  const rawFrameIndex = Number.isFinite(state.sampleFrame[template.id])
    ? state.sampleFrame[template.id]
    : annotationFrameIndex(template.id, step);
  const activeAnnotationFrame = teacherFrames.includes(rawFrameIndex) ? rawFrameIndex : teacherFrames[0];
  const displayFrameIndex = hasImages
    ? (step === 2 ? activeAnnotationFrame : rawFrameIndex)
    : 0;
  const frameData = hasImages ? imageFrameData(template.id, displayFrameIndex) : null;
  const boxes = annotationBoxes(template.id, activeAnnotationFrame);
  const stats = annotationStats(template.id);
  const annotatedCount = annotatedFrameCount(template.id);
  const requiredCount = requiredAnnotationCount(template.id);
  const canTrain = isTraining || annotatedCount >= requiredCount;
  const targetFrameIndex = imageTemplate(template.id) ? 5 : 0;
  const annotationLabel = {
    "slope-monitoring": "地すべり",
    "river-monitoring": "冠水域",
    "inspection-damage": "ひび割れ"
  }[template.id] || "対象範囲";
  const flowGuide = isTraining
    ? "データと目的を選び、現在値を判定・予測する画面にします。"
    : "参考画像に対象を塗り、検知モデルを完成画面に組み込みます。";
  const ux = templateUx(template.id);
  const flow = isTraining
    ? [["データ選択", "選ぶ"], ["目的確認", "見る"], ["AI学習", "学習"], ["完成画面", "生成"]]
    : [["画像セット", "見る"], [teachLabel, "塗る"], ["AI学習", "精度を見る"], ["完成画面", "生成する"]];
  const flowCards = flow.map(([title, text], index) => {
    const number = index + 1;
    const locked = !isTraining && number > 2 && !canTrain;
    return `<button type="button" data-flow-step="${number}" class="${number === step ? "current" : number < step ? "done" : ""}" ${locked ? "disabled" : ""}>
      <span>${number}</span><strong>${title}</strong><small>${text}</small>
    </button>`;
  }).join("");
  const sampleThumbs = demo.samples.map((item, index) => `
    <button type="button" data-sample-template="${escapeHtml(template.id)}" data-sample-frame="${index}" class="sample-thumb ${escapeHtml(template.id)} sample-${index + 1} ${index === displayFrameIndex ? "active" : ""}" ${hasImages ? `style="background-image:linear-gradient(180deg,rgba(16,32,51,0.02),rgba(16,32,51,0.46)),url('${monitoringImage(template.id, index)}')"` : ""}>
      <span>${escapeHtml(item)}</span>
    </button>`).join("");
  const teacherThumbs = teacherFrames.map((frameIndex, index) => {
    const done = annotationBoxes(template.id, frameIndex).length > 0;
    const frame = imageFrameData(template.id, frameIndex);
    return `
      <button type="button" data-sample-template="${escapeHtml(template.id)}" data-sample-frame="${frameIndex}" class="teacher-thumb ${frameIndex === activeAnnotationFrame ? "active" : ""} ${done ? "done" : ""}" style="background-image:linear-gradient(180deg,rgba(16,32,51,0.02),rgba(16,32,51,0.50)),url('${monitoringImage(template.id, frameIndex)}')">
        <span>${escapeHtml(frame?.label || `教師${index + 1}`)}</span>
        <strong>${done ? "作成済み" : "未作成"}</strong>
      </button>`;
  }).join("");
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
        <div class="teacher-thumb-grid">${teacherThumbs}</div>
        <div class="stage-visual ${escapeHtml(template.id)} annotation-canvas real-frame ${accepted ? "accepted" : ""}" data-annotation-canvas="${escapeHtml(template.id)}" data-annotation-frame="${activeAnnotationFrame}" style="background-image:linear-gradient(180deg,rgba(7,24,44,0.02),rgba(7,24,44,0.14)),url('${monitoringImage(template.id, activeAnnotationFrame)}')">
          ${maskMarkup}
          <div class="annotation-hint">${accepted ? "教師データ作成済み" : escapeHtml(ux.annotationAction)}</div>
        </div>
        <div class="annotation-toolbar paint">
          <label class="brush-size">
            <span>塗り幅</span>
            <input data-annotation-brush="${escapeHtml(template.id)}" type="range" min="4" max="44" value="${state.annotationBrush}">
          </label>
          <button type="button" data-suggest-mask="${escapeHtml(template.id)}" data-annotation-frame="${activeAnnotationFrame}">対象を自動で塗る</button>
          <button type="button" data-annotation-undo="${escapeHtml(template.id)}" data-annotation-frame="${activeAnnotationFrame}" ${boxes.length ? "" : "disabled"}>戻す</button>
          <button type="button" data-annotation-clear="${escapeHtml(template.id)}" data-annotation-frame="${activeAnnotationFrame}" ${boxes.length ? "" : "disabled"}>消す</button>
        </div>
      </div>
      <aside class="stage-side">
        <h3>${escapeHtml(annotationLabel)}</h3>
        <div class="annotation-status ${accepted ? "done" : ""}">
          <strong>${annotatedCount}/${requiredCount} サンプル作成</strong>
          <span>${escapeHtml(ux.annotationHelp)}</span>
        </div>
        <div class="seg-stats simple">
          <div><span>ラベル</span><strong>1</strong></div>
          <div><span>対象</span><strong>${escapeHtml(annotationLabel)}</strong></div>
          <div><span>学習</span><strong>${canTrain ? "OK" : "未"}</strong></div>
        </div>
        <p class="side-note">2枚以上に塗ると、AIが似た範囲を他の画像にも推論します。</p>
        <button type="button" data-advance-flow ${canTrain ? "" : "disabled"}>学習へ進む</button>
      </aside>
    </div>`;
  const trainingPanel = `
    <div class="flow-stage">
      <div class="training-card">
        <h3>AI学習</h3>
        <div class="train-loader" aria-hidden="true">
          <span></span><span></span><span></span><span></span>
        </div>
        ${hasImages ? `<div class="train-review-grid">
          ${teacherFrames.map((frameIndex) => `
            <div class="train-review-frame" style="background-image:linear-gradient(180deg,rgba(7,24,44,0.02),rgba(7,24,44,0.14)),url('${monitoringImage(template.id, frameIndex)}')">
              ${segmentationPreviewMarkup(template.id, frameIndex, "assist")}
            </div>
          `).join("")}
        </div>` : ""}
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
  const first = generativeExamples[0];
  return html`
    <p class="eyebrow">生成AI</p>
    <h2>生成AI活用アプリを作る</h2>
    <p class="lead">テンプレートを選ぶか、フリー作成で入力と出力をそのまま指定します。</p>
    <section class="simple-generator">
      <div class="example-chips">
        ${generativeExamples.map((item, index) => `<button type="button" class="${index === 0 ? "active" : ""} ${item.free ? "free-chip" : ""}" data-example="${escapeHtml(item.prompt)}" data-example-kind="${escapeHtml(item.id)}" data-example-title="${escapeHtml(item.title)}" data-example-input="${escapeHtml(item.input)}" data-example-output="${escapeHtml(item.output)}" data-example-free="${item.free ? "true" : "false"}">${escapeHtml(item.label)}</button>`).join("")}
      </div>
      <input type="hidden" name="generativeKind" data-generative-kind value="${escapeHtml(first.id)}">
      <div class="free-create-panel">
        <label class="field">
          <span>アプリ名</span>
          <input name="title" data-generative-title value="${escapeHtml(first.title)}" placeholder="例：打合せ記録簿作成アプリ">
        </label>
        <label class="field">
          <span>入力</span>
          <input name="inputDescription" data-generative-input value="${escapeHtml(first.input)}" placeholder="例：議事録PDF、Excel点検表、CSV、写真メモ">
        </label>
        <label class="field">
          <span>出力</span>
          <input name="outputDescription" data-generative-output value="${escapeHtml(first.output)}" placeholder="例：記録簿、チェック表、報告書、メール文面、ダウンロードファイル">
        </label>
      </div>
      <label class="field">
        <span>やりたいこと</span>
        <textarea name="instruction" class="big-prompt" data-generative-prompt placeholder="例：Excelの点検表を入力すると、異常箇所を整理し、管理者向けの確認表と報告メールを出力するアプリを作りたい。">${escapeHtml(first.prompt)}</textarea>
      </label>
      <div class="gen-summary">
        <strong>この生成AIアプリがすること</strong>
        <p>入力ファイルやテキストを受け取り、指定した処理を行い、業務で使える成果物を出力します。</p>
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

function currentConsultScenario() {
  return consultationScenarios.find((item) => item.id === state.consultScenario)
    || consultationScenarios.find((item) => item.type === state.consultType)
    || consultationScenarios[0];
}

function consultText() {
  const scenario = currentConsultScenario();
  if (scenario.id?.startsWith("other-")) return state.consultText;
  return state.consultText || scenario.prompt;
}

function consultationDemoSpec({ templateId, intrusion, flood, crack, slope, title, normalized }) {
  const customImageSpec = normalized
    ? `imagegen: ${normalized}。土木・防災・維持管理の実務デモで使うリアルな現場写真を1枚生成。固定カメラまたは点検写真の構図。UI文字、ラベル、透かし、イラスト表現は禁止。`
    : "imagegen: 相談内容に応じた土木・防災・維持管理のリアルな現場写真を1枚生成。UI文字、ラベル、透かし、イラスト表現は禁止。";
  const customMaskSpec = normalized
    ? "相談内容から主要な検知対象を1ラベルに絞り、実画像上の対象位置にだけセグメンテーションまたは検知枠を重ねる。対象外の構造物や背景を検知しない。"
    : "相談内容を確認して主要な検知対象を1ラベルに絞り、画像と対応する推論結果を作る。";
  if (templateId === "timeseries-anomaly") {
    const river = /河川|洪水|水位|雨量|越水|氾濫/i.test(normalized);
    const road = /道路|冠水|アンダーパス|通行/i.test(normalized);
    const dataset = road ? "road" : river ? "river" : "slope";
    return {
      asset: "",
      dataSpec: dataset === "road"
        ? "道路冠水水位 12時点。雨量、路面水位、排水稼働状態、通行注意ラインを含む。"
        : dataset === "river"
          ? "河川水位 12時点。雨量、水位、上昇速度、6h/24h予測、注意・警戒ラインを含む。"
          : "地すべり計測 12時点。雨量、地下水位、変位速度、異常スコア、警戒ラインを含む。",
      imageSpec: "時系列相談のため画像生成は必須ではない。代わりに観測地点図、センサー配置、実測線、予測レンジを生成する。",
      maskSpec: "なし。現在値、予測レンジ、警戒ライン、アラート文の対応を明示する。",
      dataset
    };
  }
  if (intrusion) {
    return {
      asset: "/assets/consultation/river-intrusion.jpg",
      dataSpec: "河川CCTV画像1枚。危険区域ポリゴン、人検知ボックス、滞在時間、信頼度、水位状況を含む。",
      imageSpec: "imagegen: 雨天の日本の河川CCTV。増水した河川、護岸通路、水位標、危険区域内に入った人物1名をリアルに生成。UI文字なし。",
      maskSpec: "人の矩形検知と危険区域の重なり判定。検知対象は人のみ。",
      dataset: "intrusion"
    };
  }
  if (flood) {
    return {
      asset: "/assets/consultation/road-flood.jpg",
      dataSpec: "道路冠水画像1枚。冠水域マスク、路面水位、1時間雨量、通行注意ラインを含む。",
      imageSpec: "imagegen: 雨天の日本の道路アンダーパス。水位標、濁った冠水、水が乾いた路面へ広がる境界をリアルに生成。UI文字なし。",
      maskSpec: "冠水域だけを1ラベルでセグメンテーション。乾いた路面や壁面は含めない。",
      dataset: "road"
    };
  }
  if (crack) {
    return {
      asset: "/assets/consultation/concrete-crack.jpg",
      dataSpec: "近接点検写真1枚。ひび割れポリライン、推定幅、延長、写真台帳コメントを含む。",
      imageSpec: "imagegen: コンクリート構造物の近接点検写真。細い主ひび割れ1本と自然な分岐をリアルに生成。UI文字なし。",
      maskSpec: "ひび割れだけを1ラベルで細線セグメンテーション。汚れや目地は除外する。",
      dataset: "crack"
    };
  }
  if (!slope && !intrusion && !flood && !crack) {
    return {
      asset: "",
      dataSpec: "相談内容に合わせた現場画像1枚、検知対象1ラベル、判定スコア、根拠メモ、通知文を含む。",
      imageSpec: customImageSpec,
      maskSpec: customMaskSpec,
      dataset: "custom"
    };
  }
  return {
    asset: "/assets/consultation/slope-landslide.jpg",
    dataSpec: "斜面監視画像1枚。地すべり領域マスク、24h雨量、累積変位、変位速度を含む。",
    imageSpec: "imagegen: 豪雨後の日本の山腹斜面監視画像。森林斜面、管理道路、明瞭な地すべり裸地をリアルに生成。UI文字なし。",
    maskSpec: "地すべり裸地だけを1ラベルでセグメンテーション。周辺植生と道路は除外する。",
    dataset: slope ? "slope" : "custom"
  };
}

function inferConsultPlan(text, preferredType = state.consultType, scenario = currentConsultScenario()) {
  const raw = String(text || "").trim();
  const normalized = raw || scenario.prompt || "";
  const isDocument = /議事|打合せ|打ち合わせ|記録簿|報告書|計画書|仕様書|提案|メール|要約|文章|文書|契約|照査|台帳|ダウンロード/i.test(normalized);
  const isTimeSeries = /水位|雨量|流量|地下水|変位|傾斜|センサー|計測|時系列|予測|forecast|異常|アラート|洪水|越水/i.test(normalized);
  const isImage = /画像|カメラ|CCTV|動画|写真|ドローン|ひび|亀裂|浸水|冠水|侵入|人物|人|地すべり|斜面|崩壊|検知/i.test(normalized);
  const type = isDocument && !isImage && !isTimeSeries
    ? "generative"
    : isImage || isTimeSeries
      ? "specialized"
      : preferredType;

  if (type === "generative") {
    const meeting = /議事|打合せ|打ち合わせ|記録簿|協議|指示事項|行政|発注者/i.test(normalized);
    const report = /点検|報告書|台帳|写真|所見/i.test(normalized);
    const proposal = /提案|PoC|相談|営業|顧客/i.test(normalized);
    return {
      type,
      templateId: "",
      dataset: "none",
      goal: "document",
      title: meeting ? "打合せ記録簿作成" : report ? "点検報告書作成" : proposal ? "AI活用提案書作成" : "生成AI業務アプリ",
      tag: "文書業務",
      humanMode: "文書・資料を作るAI",
      inputDescription: meeting ? "議事録・会議メモのサンプル1件" : "業務資料・メモのサンプル1件",
      output: meeting ? "協議事項、指示事項、未確認事項、記録簿ダウンロード" : report ? "所見、報告書下書き、確認事項、出力ファイル" : "整理結果、業務文書、確認事項、出力ファイル",
      dataPlan: meeting ? "議事録サンプルを1件用意" : "相談内容に合う入力サンプルを1件用意",
      screenPlan: meeting ? "ドラッグ&ドロップ、記録簿生成、Wordダウンロード" : "入力、AI整理、成果物、確認事項を1画面化",
      checks: meeting ? ["協議/指示を分離", "不足確認を表示", "Wordで出力"] : ["入力を用意", "結果を編集", "成果物を出力"],
      instructionFocus: "生成AI活用。曖昧な相談内容から、入力ファイルまたはテキストを処理して業務成果物を出すアプリに仕上げる。"
    };
  }

  const intrusion = /(人|人物|歩行者|作業員|立入|立ち入り|立ち入|人の侵入)/i.test(normalized)
    && !/(車両|作業車|トラック|重機|船舶|船|クレーン|コンテナ)/i.test(normalized);
  const flood = /洪水|水位|雨量|流量|越水|河川|氾濫|上昇|予測/i.test(normalized);
  const crack = /ひび|亀裂|損傷|橋梁|トンネル|コンクリート|点検写真/i.test(normalized);
  const slope = /斜面|地すべり|崩壊|変位|地下水|傾斜/i.test(normalized);
  const templateId = intrusion || flood ? (isTimeSeries && !intrusion ? "timeseries-anomaly" : "river-monitoring") : crack ? "inspection-damage" : slope ? "slope-monitoring" : scenario.templateId || "river-monitoring";
  const dataset = flood && templateId === "timeseries-anomaly" ? "river" : slope ? "slope" : scenario.dataset || "river";
  const goal = /異常/.test(normalized) ? "anomaly" : "forecast";
  const title = intrusion ? "河川CCTV侵入検知" : flood ? "水位・雨量 洪水アラート" : crack ? "ひび割れ検知" : slope ? "斜面監視AI" : "相談AIデモ";
  const demoSpec = consultationDemoSpec({ templateId, intrusion, flood, crack, slope, title, normalized });
  return {
    type: "specialized",
    templateId,
    dataset: demoSpec.dataset || dataset,
    goal,
    title,
    tag: intrusion ? "画像検知" : templateId === "timeseries-anomaly" ? "時系列予測" : crack ? "点検画像" : "現場AI",
    humanMode: "画像・センサーで判断するAI",
    inputDescription: intrusion ? "CCTVデモ画像1件" : templateId === "timeseries-anomaly" ? "計測データ1セット" : "現場デモ画像1件",
    output: intrusion ? "人の侵入検知、危険区域判定、現地確認アラート" : flood ? "水位・雨量の予測、洪水リスク、自治体向けアラート" : crack ? "ひび割れ検知、位置、点検コメント" : "AI検知結果、警戒判定、通知文",
    dataPlan: demoSpec.dataSpec,
    screenPlan: intrusion ? "画像、検知枠、危険区域、アラート文" : templateId === "timeseries-anomaly" ? "現在値、予測線、警戒判定、通知文" : "画像、AI検知、根拠グラフ、通知文",
    checks: intrusion ? ["人を検知", "危険区域を判定", "現地確認文を出力"] : templateId === "timeseries-anomaly" ? ["現在値を表示", "予測を表示", "警戒文を出力"] : ["対象を検知", "根拠を表示", "通知文を出力"],
    asset: demoSpec.asset,
    imageSpec: demoSpec.imageSpec,
    maskSpec: demoSpec.maskSpec,
    instructionFocus: "特化型AI。実データがなくても、相談内容に合うデモデータ1件と推論結果をアプリ内で用意し、完成した監視・点検コンソールとして見せる。"
  };
}

function consultChartSvg(scenario) {
  const base = scenario.id === "flood-alert"
    ? [0.18, 0.22, 0.29, 0.38, 0.52, 0.67, 0.78, 0.86]
    : scenario.id === "slope-consult"
      ? [0.14, 0.19, 0.24, 0.35, 0.49, 0.63, 0.76, 0.88]
      : [0.1, 0.14, 0.23, 0.42, 0.69, 0.82, 0.9, 0.86];
  const values = base;
  const width = 440;
  const height = 150;
  const pad = 22;
  const xStep = (width - pad * 2) / (values.length - 1);
  const y = (value) => height - pad - value * (height - pad * 2);
  const points = values.map((value, index) => `${(pad + xStep * index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const thresholdY = y(0.72).toFixed(1);
  return `<svg class="consult-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="生成した時系列データ">
    <rect width="${width}" height="${height}" rx="10" fill="#fff"></rect>
    <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#c9d8e8"></line>
    <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#c9d8e8"></line>
    <line x1="${pad}" y1="${thresholdY}" x2="${width - pad}" y2="${thresholdY}" stroke="#d98a1d" stroke-dasharray="6 6"></line>
    <polyline points="${points}" fill="none" stroke="#1d63b7" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
    ${values.map((value, index) => `<circle cx="${(pad + xStep * index).toFixed(1)}" cy="${y(value).toFixed(1)}" r="${index === values.length - 1 ? 6 : 4}" fill="${value > 0.72 ? "#d98a1d" : "#1d63b7"}"></circle>`).join("")}
  </svg>`;
}

function consultationPlanHtml(plan) {
  if (plan.type === "generative") {
    return html`
      <div class="consult-preview-card">
        <span>AIの理解</span>
        <strong>${escapeHtml(plan.humanMode)}</strong>
        <p>${escapeHtml(plan.title)}として作ります。</p>
      </div>
      <div class="consult-direction-grid">
        <div><span>用意するもの</span><strong>${escapeHtml(plan.dataPlan)}</strong></div>
        <div><span>完成画面</span><strong>${escapeHtml(plan.screenPlan)}</strong></div>
      </div>
      <div class="consult-flow-mini">
        ${plan.checks.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
      </div>`;
  }
  const chartScenario = { id: plan.templateId === "timeseries-anomaly" ? "flood-alert" : "other" };
  const imageMock = plan.templateId !== "timeseries-anomaly";
  return html`
    <div class="consult-preview-card">
      <span>AIの理解</span>
      <strong>${escapeHtml(plan.humanMode)}</strong>
      <p>${escapeHtml(plan.title)}として作ります。</p>
    </div>
    ${imageMock ? (plan.asset ? `
      <div class="consult-mock cctv ${plan.asset ? "with-photo" : ""}">
        <div class="mock-camera ${plan.asset ? "photo" : ""}" ${plan.asset ? `style="background-image:linear-gradient(180deg,rgba(7,24,44,0.02),rgba(7,24,44,0.16)),url('${escapeHtml(plan.asset)}')"` : ""}>
          <span class="mock-detect">${escapeHtml(plan.checks[0] || "検知")}</span>
        </div>
        <div class="mock-result">
          <strong>${escapeHtml(plan.dataPlan)}</strong>
          <span>${escapeHtml(plan.screenPlan)}</span>
        </div>
      </div>` : `
      <div class="consult-imagegen-placeholder">
        <span>画像生成</span>
        <strong>相談内容に合う現場写真を生成</strong>
        <p>${escapeHtml((plan.imageSpec || "相談内容に応じたリアルな現場写真を生成します。").replace(/^imagegen:\s*/i, ""))}</p>
      </div>`) : consultChartSvg(chartScenario)}
    ${plan.imageSpec ? `<div class="consult-preview-card compact"><span>画像生成</span><p>${escapeHtml(plan.imageSpec.replace(/^imagegen:\\s*/i, ""))}</p></div>` : ""}
    ${plan.maskSpec ? `<div class="consult-preview-card compact"><span>AI判定</span><p>${escapeHtml(plan.maskSpec)}</p></div>` : ""}
    <div class="consult-direction-grid">
      <div><span>用意するもの</span><strong>${escapeHtml(plan.dataPlan)}</strong></div>
      <div><span>完成画面</span><strong>${escapeHtml(plan.screenPlan)}</strong></div>
    </div>
    <div class="consult-flow-mini">
      ${plan.checks.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
    </div>`;
}

function consultationInstruction(plan, prompt) {
  const base = String(prompt || "").trim();
  return `${base || "相談内容は未入力です。土木分野のAI活用相談として、参加者が試せる最小の完成アプリにしてください。"}

相談内容が曖昧な場合でも、以下の方向性で補完して完成アプリにしてください。
- 方向性: ${plan.humanMode}
- アプリ案: ${plan.title}
- デモデータ: ${plan.dataPlan}
- 完成画面: ${plan.screenPlan}
- 出力: ${plan.output}
${plan.imageSpec ? `- 画像生成仕様: ${plan.imageSpec}` : ""}
${plan.maskSpec ? `- AI判定仕様: ${plan.maskSpec}` : ""}
${plan.asset ? `- 既定の参考画像: ${plan.asset}` : ""}

相談モードなので、デモデータは1ケースで十分です。画像系なら相談内容に合わせて imagegen で生成する前提のリアルな現場画像1枚と、そこに対応する検知結果を用意してください。実行環境で画像生成ができない場合は、既定の参考画像を使い、画像生成仕様に合うようUI、検知マスク、数値、説明を調整してください。時系列なら「水位・雨量などの1セットと予測結果」、文書系なら「サンプル入力1件と成果物」をアプリ内で自然に用意してください。
ユーザーはAIやITに詳しくない前提です。専門用語の説明を増やさず、入力、AI判定、完成結果が直感的に分かるUIにしてください。
${plan.instructionFocus}`;
}

function consultationForm() {
  const scenario = currentConsultScenario();
  const text = consultText();
  const plan = inferConsultPlan(text, state.consultType, scenario);
  const scenarioCards = consultationScenarios
    .filter((item) => item.type === state.consultType)
    .map((item) => `
      <button type="button" data-consult-scenario="${escapeHtml(item.id)}" class="${item.id === scenario.id ? "active" : ""}">
        <span>${escapeHtml(item.tag)}</span>
        <strong>${escapeHtml(item.title)}</strong>
      </button>`).join("");

  return html`
    <p class="eyebrow">相談モード</p>
    <h2>相談から方向性を整理する</h2>
    <section class="consult-builder">
      <div class="consult-main">
        <div class="consult-type-switch">
          <button type="button" data-consult-type="specialized" class="${state.consultType === "specialized" ? "active" : ""}">画像・センサーで判断</button>
          <button type="button" data-consult-type="generative" class="${state.consultType === "generative" ? "active" : ""}">文書・資料を作成</button>
        </div>
        <p class="consult-helper">近い相談例を選ぶか、そのまま書いてください。右側で作成方針を確認できます。</p>
        <div class="consult-scenarios">${scenarioCards}</div>
        <label class="field">
          <span>やりたいこと</span>
          <textarea name="consultation" class="big-prompt" data-consultation-input placeholder="例：河川のカメラで危ない場所に人が入ったら分かるようにしたい">${escapeHtml(text)}</textarea>
        </label>
      </div>
      <aside class="consult-side">
        <div class="consult-side-head">
          <div>
            <span class="pill">${escapeHtml(plan.tag)}</span>
            <h3>作成前の確認</h3>
          </div>
        </div>
        <div id="consultPlan">${consultationPlanHtml(plan)}</div>
      </aside>
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
  const mode = state.aiType;
  let submitAiType = mode;
  let templateIds = mode === "specialized" ? Array.from(state.selectedTemplates) : [];
  let timeseriesDataset = state.tsDataset;
  let timeseriesGoal = state.tsGoal;
  if (mode === "consultation") {
    const scenario = currentConsultScenario();
    const prompt = String(data.get("consultation") || scenario.prompt || "").trim();
    const plan = inferConsultPlan(prompt, state.consultType, scenario);
    submitAiType = plan.type;
    templateIds = plan.type === "specialized" ? [plan.templateId || "river-monitoring"] : [];
    timeseriesDataset = plan.dataset || state.tsDataset;
    timeseriesGoal = plan.goal === "anomaly" ? "anomaly" : "forecast";
    data.set("title", `${plan.title} デモ`);
    data.set("instruction", consultationInstruction(plan, prompt));
    data.set("inputDescription", plan.inputDescription);
    data.set("outputDescription", plan.output);
    data.set("consultationPlan", [
      `方向性: ${plan.humanMode}`,
      `アプリ案: ${plan.title}`,
      `デモデータ: ${plan.dataPlan}`,
      `完成画面: ${plan.screenPlan}`,
      `確認ポイント: ${plan.checks.join(" / ")}`,
      plan.imageSpec ? `画像生成仕様: ${plan.imageSpec}` : "",
      plan.maskSpec ? `AI判定仕様: ${plan.maskSpec}` : "",
      plan.asset ? `参考画像: ${plan.asset}` : ""
    ].join("\n"));
    data.set("consultationAsset", plan.asset || "");
    data.set("consultationDataSpec", plan.dataPlan || "");
    data.set("imageGenerationSpec", plan.imageSpec || "");
    data.set("maskSpec", plan.maskSpec || "");
    data.set("dataMode", "default");
  }
  data.set("aiType", submitAiType);
  data.set("selectedTemplateIds", JSON.stringify(submitAiType === "specialized" ? templateIds : []));
  data.set("timeseriesDataset", timeseriesDataset);
  data.set("timeseriesGoal", timeseriesGoal);
  const hasFiles = Array.from(form.querySelectorAll('input[type="file"]')).some((input) => input.files && input.files.length > 0);
  if (hasFiles) data.set("dataMode", "upload");
  if (submitAiType === "generative") {
    const instruction = String(data.get("instruction") || "").trim() || "入力ファイルやテキストを受け取り、必要な処理を行い、業務で使える成果物を出力する生成AI活用アプリを作る。";
    const currentTitle = String(data.get("title") || "").trim();
    const inputDescription = String(data.get("inputDescription") || "").trim();
    const outputDescription = String(data.get("outputDescription") || "").trim();
    data.set("instruction", instruction);
    if (mode !== "consultation" && !currentTitle) {
      data.set("title", instruction.slice(0, 30) + (instruction.length > 30 ? "..." : ""));
    }
    if (mode !== "consultation") {
      data.set("inputDescription", inputDescription || "アップロード資料または入力テキスト");
      data.set("outputDescription", outputDescription || "業務で使える下書き、要点、確認事項を生成");
    }
  }
  if (submitAiType === "specialized") {
    data.set("annotationSummary", specializedAnnotationSummary(templateIds[0] || "slope-monitoring"));
  }
  if (state.stagedFiles.length) {
    data.delete("files");
    state.stagedFiles.forEach((file) => data.append("files", file, file.name));
    data.set("dataMode", "upload");
  }

  try {
    const response = await api("/api/projects", { method: "POST", body: data });
    state.activeProjectId = response.project.id;
    state.keepImproveOpen = false;
    state.stagedFiles = [];
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
          state.view = "app-create";
          state.builderStage = "archive";
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
    area.querySelectorAll(".live-log ol").forEach((list) => {
      list.scrollTop = list.scrollHeight;
    });
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
        <p class="eyebrow">AIアプリ体験</p>
        <h1>作成済みアプリ</h1>
        <p>完成デモを開く、改良する、削除する。</p>
      </div>
      <button type="button" class="secondary" data-builder-new>新しく作る</button>
    </header>
    ${state.projects.length ? `<section class="archive-grid">${cards}</section>` : `<div class="empty">まだ作成したアプリはありません。</div>`}`;

  document.querySelectorAll("[data-improve-form]").forEach((form) => {
    form.addEventListener("submit", submitImprovement);
  });
  document.querySelectorAll("[data-delete-project]").forEach((button) => {
    button.addEventListener("click", deleteProject);
  });
  document.querySelector("[data-builder-new]")?.addEventListener("click", () => {
    state.view = "app-create";
    state.builderStage = "select";
    state.activeProjectId = null;
    history.replaceState(null, "", "#app-create");
    renderApp();
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
