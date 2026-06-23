import { scrapeTask, verifyTask } from "./parser.piscina-worker.js";

interface TaskMessage {
  id: number;
  type: "scrape" | "verify";
  payload: any;
}

interface TaskResult {
  id: number;
  result?: any;
  error?: string;
}

process.on("message", async (msg: TaskMessage) => {
  const reply: TaskResult = { id: msg.id };
  try {
    if (msg.type === "scrape") {
      reply.result = await scrapeTask(msg.payload);
    } else if (msg.type === "verify") {
      reply.result = await verifyTask(msg.payload);
    } else {
      reply.error = `Unknown task type: ${msg.type}`;
    }
  } catch (err) {
    reply.error = err instanceof Error ? err.message : String(err);
  }
  process.send!(reply);
});

process.on("disconnect", () => {
  process.exit(0);
});

process.on("uncaughtException", (err) => {
  console.error("[parser-child] uncaughtException:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[parser-child] unhandledRejection:", reason);
});
