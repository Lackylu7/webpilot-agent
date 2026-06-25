export type RunStatus =
  | "idle"
  | "planning"
  | "running"
  | "extracting"
  | "reporting"
  | "completed"
  | "failed";

export type TimelineStatus = "pending" | "running" | "completed" | "warning" | "failed";

export type AgentStage = "plan" | "run" | "approval" | "extract" | "report";

export type RunMode = "smart" | "demo" | "live";

export type TimelineItem = {
  id: string;
  index: number;
  title: string;
  detail: string;
  status: TimelineStatus;
  timestamp: string;
  url?: string;
  durationMs?: number;
};

export type ResearchTarget = {
  name: string;
  query: string;
  officialUrl?: string;
};

export type AgentPlan = {
  goal: string;
  targets: ResearchTarget[];
  steps: string[];
  riskPolicy: string;
};

export type BrowserSnapshot = {
  target: string;
  url: string;
  title: string;
  excerpt: string;
  capturedAt: string;
  sourceType: "browser" | "fetch" | "seed";
};

export type ExtractedFact = {
  product: string;
  plan: string;
  price: string;
  billing: string;
  notes: string;
  sourceUrl: string;
  confidence: number;
};

export type SourceRecord = {
  title: string;
  url: string;
  target: string;
  sourceType: BrowserSnapshot["sourceType"];
};

export type AgentReport = {
  title: string;
  summary: string;
  takeaways: string[];
  markdown: string;
  sources: SourceRecord[];
};

export type AgentRun = {
  id: string;
  task: string;
  runMode?: RunMode;
  status: RunStatus;
  activeStage: AgentStage;
  createdAt: string;
  updatedAt: string;
  plan?: AgentPlan;
  timeline: TimelineItem[];
  snapshots: BrowserSnapshot[];
  facts: ExtractedFact[];
  report?: AgentReport;
  error?: string;
};

export type RunEvent =
  | { type: "run"; run: AgentRun }
  | { type: "stage"; stage: AgentStage; status: RunStatus }
  | { type: "timeline"; item: TimelineItem }
  | { type: "snapshot"; snapshot: BrowserSnapshot }
  | { type: "facts"; facts: ExtractedFact[] }
  | { type: "report"; report: AgentReport }
  | { type: "done"; run: AgentRun }
  | { type: "error"; message: string; run?: AgentRun };
