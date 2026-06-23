import { logger } from "../../../config";
import FilterParser from "./parsing.service";
import Filter from "../../../database/filter.model";
import User from "../../../database/user.model";
import { RedisService } from "../redis.service";

interface StartMsg {
  action: "start";
  filterId: number;
  userId: number;
  proxy: string;
  /** Если задан — отдельный экземпляр на тот же filterId, без лимита «один на фильтр». */
  instanceKey?: string;
}

interface StopMsg {
  action: "stop";
  filterId: number;
}

interface PingMsg {
  action: "ping";
}

type OrchestratorMsg = StartMsg | StopMsg | PingMsg;

const activeParsers = new Map<string, FilterParser>();

function mapKeyForStart(msg: StartMsg): string {
  return msg.instanceKey ? `${msg.filterId}:${msg.instanceKey}` : String(msg.filterId);
}

async function handleStart(msg: StartMsg) {
  const key = mapKeyForStart(msg);
  const parallel = Boolean(msg.instanceKey);

  if (activeParsers.has(key)) {
    logger.info(`[Orchestrator] Parser slot ${key} already running locally`);
    return;
  }

  if (!parallel) {
    const count = await RedisService.getActiveParserCount(msg.filterId);
    if (count > 0) {
      logger.info(`[Orchestrator] Parser for filter ${msg.filterId} already running (Redis)`);
      return;
    }
  }

  const filter = await Filter.findByPk(msg.filterId);
  const user = await User.findByPk(msg.userId);
  if (!filter || !user) {
    logger.warn(`[Orchestrator] Filter ${msg.filterId} or user ${msg.userId} not found`);
    return;
  }

  const parser = new FilterParser(filter, user, msg.proxy, parallel ? msg.instanceKey : undefined);
  activeParsers.set(key, parser);

  parser.start()
    .catch(err => logger.error(`[Orchestrator] Parser ${key} failed:`, err))
    .finally(() => activeParsers.delete(key));

  logger.info(`[Orchestrator] Started parser for filter ${msg.filterId}${parallel ? ` (instance ${msg.instanceKey})` : ""}`);
}

function handleStop(msg: StopMsg) {
  const fid = String(msg.filterId);
  const keys = [...activeParsers.keys()].filter(
    (k) => k === fid || k.startsWith(`${fid}:`)
  );
  for (const k of keys) {
    const parser = activeParsers.get(k);
    if (parser) {
      parser.stop();
      activeParsers.delete(k);
      logger.info(`[Orchestrator] Stopped parser ${k}`);
    }
  }
}

process.on("message", async (msg: OrchestratorMsg) => {
  try {
    switch (msg.action) {
      case "start":
        await handleStart(msg);
        break;
      case "stop":
        handleStop(msg);
        break;
      case "ping":
        process.send!({ type: "pong", activeParsers: activeParsers.size });
        break;
    }
  } catch (err) {
    logger.error("[Orchestrator] Error handling message:", err);
  }
});

process.on("disconnect", () => {
  logger.info("[Orchestrator] Parent disconnected, shutting down all parsers");
  for (const parser of activeParsers.values()) parser.stop();
  activeParsers.clear();
  setTimeout(() => process.exit(0), 2000);
});

process.on("uncaughtException", (err) => {
  logger.error("[Orchestrator] uncaughtException:", err);
  process.exit(1);
});

logger.info("[Orchestrator] Parser orchestrator process started");
