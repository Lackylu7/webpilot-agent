import { runAgent } from "@/lib/agent/runner";
import type { RunEvent } from "@/lib/types/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { task?: string };
  const task = body.task?.trim();

  if (!task) {
    return Response.json({ error: "请输入任务。" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: RunEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      await runAgent(task, send);
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
