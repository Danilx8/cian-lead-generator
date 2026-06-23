import { WorkerState } from "./WorkerState";

export interface WorkerStatusMessage {
  workerId: number;
  payload: {
    newStatus: WorkerState
  };
}

export interface CianMessage {
  workerId: number;
  userId: number;
  itemId: string;
  payload: {
    text?: string;
    attachment?: string,
  };
}

export interface UserMessage {
  itemName: string;
  text?: string;
  attachment?: string;
}

export interface ItemMessageData {
  id?: number;
  cianId?: string;
  name: string;
  merchantName: string;
  price: number;
  firstMessage: string;
}

/** Синхронизировано с WorkerCommandPayload в src/api/services/redis.service.ts */
export type WorkerCommandPayload =
  | { command: "shutdown" }
  | { command: "pause" }
  | { command: "credentials" }
  | { command: "reverify"; countryCode: string; phoneNumber: string }
  | { command: "verify"; countryCode: string; phoneNumber: string }
  | { command: "code"; code: string };

export interface WorkerVerificationPublishPayload {
  workerId: number;
  userId: number;
  success: boolean;
  phoneNumber?: string;
}

export interface WorkerCodePublishPayload {
  workerId: number;
  userId: number;
  success: boolean;
}

export interface NewDialogMessage {
  workerId: number;
  userId: number;
  itemName: string;
}