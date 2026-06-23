import * as k8s from "@kubernetes/client-node";
import { existsSync } from "fs";

let cached: { coreApi: k8s.CoreV1Api; logs: k8s.Log } | null = null;

/**
 * Ленивая инициализация клиента Kubernetes.
 * Нужна чтобы дочерний процесс parser-orchestrator (импортирует WorkerService) не падал
 * при старте, если kubeconfig ещё не смонтирован или K8s не используется.
 */
export function getK8sClients(): { coreApi: k8s.CoreV1Api; logs: k8s.Log } {
  if (cached) return cached;

  const path = process.env.KUBECONFIG || "/app/k8s/k3s.yaml";
  if (!existsSync(path)) {
    throw new Error(
      `Kubernetes kubeconfig not found: ${path}. Mount k3s.yaml or set KUBECONFIG before using worker pods.`
    );
  }

  const kc = new k8s.KubeConfig();
  kc.loadFromFile(path);
  const cluster = kc.clusters[0];
  const modifiedCluster = {
    ...cluster,
    server: "https://k3s:6443",
    skipTLSVerify: true
  };
  kc.clusters[0] = modifiedCluster;

  cached = {
    coreApi: kc.makeApiClient(k8s.CoreV1Api),
    logs: new k8s.Log(kc)
  };
  return cached;
}
