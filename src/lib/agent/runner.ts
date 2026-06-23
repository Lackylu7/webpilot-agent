import type { AgentRun, RunEvent, TimelineItem } from "@/lib/types/agent";
import { createId } from "@/lib/utils/ids";
import { nowIso } from "@/lib/utils/time";
import { browseTarget } from "./browser-runner";
import { extractFacts } from "./extractor";
import { createPlan } from "./planner";
import { buildReport } from "./reporter";
import { saveRun } from "@/lib/store/runs";

type Emit = (event: RunEvent) => void;

export async function runAgent(task: string, emit: Emit): Promise<AgentRun> {
  const startedAt = nowIso();
  const run: AgentRun = {
    id: createId(),
    task,
    status: "planning",
    activeStage: "plan",
    createdAt: startedAt,
    updatedAt: startedAt,
    timeline: [],
    snapshots: [],
    facts: []
  };

  emit({ type: "run", run });

  try {
    const planStarted = Date.now();
    const plan = await createPlan(task);
    run.plan = plan;
    run.status = "running";
    run.activeStage = "run";
    run.updatedAt = nowIso();
    emit({ type: "stage", stage: "plan", status: "planning" });
    emitTimeline(run, emit, {
      title: "Plan created",
      detail: `Generated ${plan.steps.length} steps for ${plan.targets.length} target${plan.targets.length === 1 ? "" : "s"}.`,
      status: "completed",
      durationMs: Date.now() - planStarted
    });

    emit({ type: "stage", stage: "run", status: "running" });

    for (const target of plan.targets) {
      const browseStarted = Date.now();
      emitTimeline(run, emit, {
        title: `Open ${target.name}`,
        detail: target.officialUrl ?? target.query,
        status: "running",
        url: target.officialUrl
      });
      const snapshot = await browseTarget(target);
      run.snapshots.push(snapshot);
      run.updatedAt = nowIso();
      emit({ type: "snapshot", snapshot });
      emitTimeline(run, emit, {
        title: `Captured ${target.name}`,
        detail: `${snapshot.title} (${snapshot.sourceType})`,
        status: "completed",
        url: snapshot.url,
        durationMs: Date.now() - browseStarted
      });

      run.status = "extracting";
      run.activeStage = "extract";
      emit({ type: "stage", stage: "extract", status: "extracting" });
      const extractStarted = Date.now();
      const facts = await extractFacts(snapshot);
      run.facts.push(...facts);
      emit({ type: "facts", facts: run.facts });
      emitTimeline(run, emit, {
        title: `Extracted ${target.name} facts`,
        detail: `${facts.length} structured row${facts.length === 1 ? "" : "s"} added to the comparison table.`,
        status: facts.length > 0 ? "completed" : "warning",
        url: snapshot.url,
        durationMs: Date.now() - extractStarted
      });
    }

    run.status = "reporting";
    run.activeStage = "report";
    emit({ type: "stage", stage: "report", status: "reporting" });
    const report = buildReport(plan, run.snapshots, run.facts);
    run.report = report;
    emit({ type: "report", report });
    emitTimeline(run, emit, {
      title: "Final report drafted",
      detail: `${report.sources.length} sources cited and ${report.takeaways.length} takeaways generated.`,
      status: "completed"
    });

    run.status = "completed";
    run.activeStage = "report";
    run.updatedAt = nowIso();
    await saveRun(run);
    emit({ type: "done", run });
    return run;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown agent failure";
    run.status = "failed";
    run.error = message;
    run.updatedAt = nowIso();
    emitTimeline(run, emit, {
      title: "Run failed",
      detail: message,
      status: "failed"
    });
    await saveRun(run);
    emit({ type: "error", message, run });
    return run;
  }
}

function emitTimeline(
  run: AgentRun,
  emit: Emit,
  item: Omit<TimelineItem, "id" | "index" | "timestamp">
) {
  const timelineItem: TimelineItem = {
    id: createId("step"),
    index: run.timeline.length + 1,
    timestamp: nowIso(),
    ...item
  };
  run.timeline.push(timelineItem);
  run.updatedAt = nowIso();
  emit({ type: "timeline", item: timelineItem });
}
