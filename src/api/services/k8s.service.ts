import { getK8sClients } from "../../k8s/k8s";
import { ENV, logger } from "../../config";
import { V1EnvVar } from "@kubernetes/client-node";
import { K8sError } from "../errors/k8s.error";
import { SocketIOStream } from "../sockets/log.socket";
import { getSocket } from "../../socket-holder";
import Proxy from "../../database/proxy.model";
import User from "../../database/user.model";
import { execSync } from "child_process";
import { BrowserCoreTypes } from "./browsers/types";
import { getThermopticUrl } from "./ThermopticService";

function coreApi() {
  return getK8sClients().coreApi;
}
function k8sLogs() {
  return getK8sClients().logs;
}

export async function launchPod(user: User, workerId: number, wsPort: number, proxy: Proxy, browserType: BrowserCoreTypes, geckoDriverPath?: string, workerLogin = "", workerPassword = "") {
  const podName = workerId.toString();
  const namespace = user.id.toString();

  if (await checkPodExists(namespace, podName)) {
    const pod = await getPod(namespace, podName);
    if (!pod) throw new K8sError(`Failed to get existing pod: ${namespace}:${podName}`);
    return pod;
  }

  const proxyType = proxy.protocol === "https" ? "http" : proxy.protocol;

  if (!await checkNamespaceExists(namespace)) {
    logger.info(`Namespace ${namespace} not found, creating it...`);
    await createNamespace(namespace);
  }

  const podManifest = {
    apiVersion: "v1",
    kind: "Pod",
    metadata: { name: podName },
    spec: {
      ttlSecondsAfterFinished: 60,
      hostNetwork: true,
      dnsPolicy: "ClusterFirstWithHostNet",
      activeDeadlineSeconds: 86400, //24 часа
      securityContext: {
        allowPrivilegeEscalation: false,
        runAsUser: 0
      },
      containers: [{
        name: "puppeteer",
        image: "ghcr.io/cian-lead/worker:latest",
        command: ["npx", "tsx", "./src/workerProcess.ts"],
        ports: [
          {
            hostPort: wsPort,
            containerPort: wsPort
          }
        ],
        volumeMounts: [
          {
            name: "pictures",
            mountPath: "/storage/pictures"
          },
          {
            name: "logs",
            mountPath: "/logs"
          }
        ],
        env: [
          { name: "WORKER_ID", value: workerId.toString() } as V1EnvVar,
          { name: "USER_ID", value: user.id.toString() } as V1EnvVar,
          { name: "HEARTBEAT_INTERVAL", value: ENV.HEARTBEAT_INTERVAL.toString() } as V1EnvVar,
          { name: "RECONNECT_ATTEMPTS", value: ENV.RECONNECT_ATTEMPTS.toString() } as V1EnvVar,
          { name: "RECONNECT_DELAY", value: ENV.RECONNECT_DELAY.toString() } as V1EnvVar,
          { name: "REDIS_USERNAME", value: ENV.REDIS_USERNAME } as V1EnvVar,
          { name: "REDIS_PASSWORD", value: ENV.REDIS_PASSWORD } as V1EnvVar,
          { name: "REDIS_HOST", value: getDockerHostIp() } as V1EnvVar,
          { name: "REDIS_PORT", value: ENV.REDIS_PORT.toString() } as V1EnvVar,
          { name: "BROWSER_URL", value: `http://${getDockerHostIp()}:${wsPort}` } as V1EnvVar,
          { name: "PROXY_TYPE", value: proxyType } as V1EnvVar,
          { name: "PROXY_ADDRESS", value: proxy.host } as V1EnvVar,
          { name: "PROXY_PORT", value: proxy.port.toString() } as V1EnvVar,
          { name: "PROXY_LOGIN", value: proxy.username } as V1EnvVar,
          { name: "PROXY_PASSWORD", value: proxy.password ?? "" } as V1EnvVar,
          { name: "ANGEBOT", value: user.sendWithAngebot.toString() } as V1EnvVar,
          { name: "MESSAGE_INTERVAL", value: (user.itemsInterval ?? 30000).toString() } as V1EnvVar,
          { name: "PUPPETEER_TIMEOUT", value: (300000).toString() } as V1EnvVar, // ожидаение в 2 минуты
          { name: "HEADLESS", value: ENV.NODE_ENV === "production" ? "1" : "0" } as V1EnvVar,
          { name: "FOLDER_PATH", value: ENV.FOLDER_PATH } as V1EnvVar,
          { name: "WORKER_LOGIN", value: workerLogin } as V1EnvVar,
          { name: "WORKER_PASSWORD", value: workerPassword } as V1EnvVar
        ]
      }],
      restartPolicy: "Never",
      volumes: [
        {
          name: "pictures",
          hostPath: {
            path: "/storage/pictures",
            type: "DirectoryOrCreate"
          }
        },
        {
          name: "logs",
          hostPath: {
            path: "/logs",
            type: "DirectoryOrCreate"
          }
        }
      ]
    }
  };

  const pod = await coreApi().createNamespacedPod({
    namespace: namespace,
    body: podManifest
  });
  return pod.metadata?.name;
}

export async function checkNamespaceExists(namespace: string): Promise<boolean> {
  try {
    await coreApi().readNamespace({ name: namespace });
    logger.info(`Namespace ${namespace} already exists`);
    return true;
  } catch (error: any) {
    if (error.message.includes("not found")) return false;
    throw new K8sError(error.message);
  }
}

export async function listNamespacedPods(userId: string) {
  return await coreApi().listNamespacedPod({ namespace: userId });
}

export async function deletePod(podName: string, namespace: string) {
  if (await checkPodExists(namespace, podName)) {
    await coreApi().deleteNamespacedPod({
      name: podName,
      namespace: namespace
    });
  }
  
  // Удаляем ConfigMap для HTTP воркера (если есть)
  const configMapName = `worker-${podName}-cookies`;
  try {
    await coreApi().deleteNamespacedConfigMap({
      name: configMapName,
      namespace: namespace
    });
    logger.info(`[deletePod] ConfigMap deleted: ${configMapName}`);
  } catch (error: any) {
    // ConfigMap может не существовать для browser-based воркеров
    logger.debug(`[deletePod] ConfigMap not found (ok for browser workers): ${configMapName}`);
  }

}

export async function createNamespace(userId: string) {
  let namespace = {
    apiVersion: "v1",
    kind: "Namespace",
    metadata: { name: userId }
  };
  coreApi().createNamespace({ body: namespace }).then((namespace) => {
    logger.info("Successfully created namespace", namespace);
  }, (error) => {
    throw new K8sError(error);
  });
}

export async function getPodLogs(workerId: string, userId: string) {
  try {
    return await coreApi().readNamespacedPodLog({
      name: workerId,
      namespace: userId
    });
  } catch (error: any) {
    throw new K8sError(`Failed to get logs for pod ${workerId}: ${error.message}`);
  }
}

export async function streamPodLogs(workerId: string, userId: string) {
  try {
    return await k8sLogs().log(userId, workerId, "puppeteer", new SocketIOStream(getSocket(), userId), {
      follow: true,
      pretty: true,
      timestamps: true,
      previous: true
    });
  } catch (error: any) {
    throw new K8sError(`Failed to stream logs for pod ${workerId}: ${error.message}`);
  }
}

export async function checkPodExists(namespace: string, podName: string) {
  try {
    await coreApi().readNamespacedPod({
      namespace,
      name: podName
    });
  } catch (e) {
    return false;
  }

  return true;
}

export async function getPod(namespace: string, podName: string) {
  try {
    return await coreApi().readNamespacedPod({
      namespace,
      name: podName
    });
  } catch (e) {
    return null;
  }
}

export async function launchHttpPod(user: User, workerId: number, proxy: Proxy, cookieData: any, userAgent?: string) {
  const podName = workerId.toString();
  const namespace = user.id.toString();
  logger.info(`[launchHttpPod] start namespace=${namespace} podName=${podName}`);

  if (await checkPodExists(namespace, podName)) {
    logger.info(`[launchHttpPod] pod already exists, returning`);
    const pod = await getPod(namespace, podName);
    if (!pod) throw new K8sError(`Failed to get existing pod: ${namespace}:${podName}`);
    return pod;
  }

  const proxyType = proxy.protocol === "https" ? "http" : proxy.protocol;

  if (!await checkNamespaceExists(namespace)) {
    logger.info(`Namespace ${namespace} not found, creating it...`);
    await createNamespace(namespace);
  }

  // Создаём ConfigMap с куками
  const configMapName = `worker-${workerId}-cookies`;
  const configMapBody = {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: { name: configMapName },
    data: { 'cookies.json': JSON.stringify(cookieData) }
  };
  
  try {
    await coreApi().createNamespacedConfigMap({
      namespace,
      body: configMapBody
    });
    logger.info(`[launchHttpPod] ConfigMap created: ${configMapName}`);
  } catch (error: any) {
    // Если ConfigMap уже существует - перезаписываем его
    if (error.statusCode === 409 || error.message?.includes('already exists')) {
      logger.info(`[launchHttpPod] ConfigMap already exists, replacing: ${configMapName}`);
      try {
        await coreApi().replaceNamespacedConfigMap({
          name: configMapName,
          namespace,
          body: configMapBody
        });
        logger.info(`[launchHttpPod] ConfigMap replaced: ${configMapName}`);
      } catch (replaceError: any) {
        logger.error(`[launchHttpPod] Failed to replace ConfigMap: ${replaceError.message}`);
        throw replaceError;
      }
    } else {
      logger.error(`[launchHttpPod] Failed to create ConfigMap: ${error.message}`);
      throw error;
    }
  }

  logger.info(`[launchHttpPod] creating Pod ${podName} in ${namespace}`);
  let redisHost: string;
  try {
    redisHost = getDockerHostIp();
  } catch (e: any) {
    logger.error(`[launchHttpPod] getDockerHostIp failed: ${e?.message}`);
    throw new K8sError(`getDockerHostIp: ${e?.message}`);
  }

  // URL общего thermoptic (один на все воркеры, запущен в docker-compose)
  const thermopticUrl = getThermopticUrl(redisHost);

  const podManifest = {
    apiVersion: "v1",
    kind: "Pod",
    metadata: { name: podName },
    spec: {
      hostNetwork: true,
      dnsPolicy: "ClusterFirstWithHostNet",
      activeDeadlineSeconds: 86400, // 24 часа
      securityContext: {
        allowPrivilegeEscalation: false,
        runAsUser: 0
      },
      containers: [{
        name: "worker-http",
        image: ENV.HTTP_WORKER_IMAGE || "ghcr.io/cian-lead/worker:latest",
        command: ["node", "dist/workerProcess.js"],
      volumeMounts: [
        { name: "cookies-volume", mountPath: "/storage/cookies", readOnly: true },
        { name: "logs", mountPath: "/app/logs" }
      ],
      env: [
        { name: "WORKER_ID", value: workerId.toString() } as V1EnvVar,
        { name: "USER_ID", value: user.id.toString() } as V1EnvVar,
        { name: "HEARTBEAT_INTERVAL", value: String(ENV.HEARTBEAT_INTERVAL ?? 60000) } as V1EnvVar,
        { name: "RECONNECT_ATTEMPTS", value: String(ENV.RECONNECT_ATTEMPTS ?? 3) } as V1EnvVar,
        { name: "RECONNECT_DELAY", value: String(ENV.RECONNECT_DELAY ?? 5000) } as V1EnvVar,
        { name: "REDIS_USERNAME", value: String(ENV.REDIS_USERNAME ?? "") } as V1EnvVar,
        { name: "REDIS_PASSWORD", value: String(ENV.REDIS_PASSWORD ?? "") } as V1EnvVar,
        { name: "REDIS_HOST", value: redisHost } as V1EnvVar,
        { name: "REDIS_PORT", value: String(ENV.REDIS_PORT ?? 6379) } as V1EnvVar,
        { name: "PROXY_TYPE", value: proxyType } as V1EnvVar,
        { name: "PROXY_ADDRESS", value: proxy.host } as V1EnvVar,
        { name: "PROXY_PORT", value: proxy.port.toString() } as V1EnvVar,
        { name: "PROXY_LOGIN", value: proxy.username } as V1EnvVar,
        { name: "PROXY_PASSWORD", value: proxy.password } as V1EnvVar,
        { name: "ANGEBOT", value: user.sendWithAngebot.toString() } as V1EnvVar,
        { name: "MESSAGE_INTERVAL", value: (user.itemsInterval ?? 30000).toString() } as V1EnvVar,
        { name: "HTTP_TIMEOUT", value: "30000" } as V1EnvVar,
        { name: "FOLDER_PATH", value: "/storage" } as V1EnvVar,
        { name: "COOKIE_FILE", value: "cookies.json" } as V1EnvVar,
        ...(userAgent ? [{ name: "USER_AGENT", value: userAgent } as V1EnvVar] : []),
        ...(thermopticUrl ? [{ name: "THERMOPTIC_URL", value: thermopticUrl } as V1EnvVar] : [])
      ]
    }],
    restartPolicy: "Never",
    volumes: [
      { name: "cookies-volume", configMap: { name: configMapName } },
      { name: "logs", hostPath: { path: "/logs", type: "DirectoryOrCreate" } }
    ]
    }
  };

  try {
    const pod = await coreApi().createNamespacedPod({ namespace: namespace, body: podManifest });
    logger.info(`[launchHttpPod] Pod created: ${pod.metadata?.name}`);
    return pod.metadata?.name;
  } catch (error: any) {
    const body = error?.body ?? error?.response?.body ?? "";
    logger.error(`[launchHttpPod] createNamespacedPod failed: ${error?.message}`, typeof body === "object" ? JSON.stringify(body) : body);

    throw error;
  }
}

function getDockerHostIp(): string {
  try {
    const nslookupOutput = execSync("nslookup host.docker.internal")
      .toString()
      .trim();

    // Ищем начало блока "Non-authoritative answer:"
    const lines = nslookupOutput.split("\n");
    let inNonAuthBlock = false;

    for (const line of lines) {
      if (line.includes("Non-authoritative answer:")) {
        inNonAuthBlock = true;
        continue;
      }

      if (inNonAuthBlock) {
        // Ищем первую строку с Address: в этом блоке
        const match = line.match(/Address:\s*([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/i);
        if (match && match[1]) {
          return match[1].trim();
        }
      }
    }

    throw new Error("Non-authoritative answer block found, but no valid IP address");
  } catch (error) {
    console.error("Failed to resolve host.docker.internal via nslookup:", error);

    // Fallback 1: пробуем getent hosts (если host.docker.internal есть в /etc/hosts)
    try {
      const getentOutput = execSync("getent hosts host.docker.internal")
        .toString()
        .trim();
      const parts = getentOutput.split(/\s+/);
      if (parts[0] && /^\d+\.\d+\.\d+\.\d+$/.test(parts[0])) {
        return parts[0];
      }
    } catch (getentError) {
      console.error("Fallback via getent hosts failed:", getentError);
    }

    // Fallback 2: ip route
    try {
      const gateway = execSync("ip route | awk '/default/ { print $3 }'")
        .toString()
        .trim();
      if (gateway && /^\d+\.\d+\.\d+\.\d+$/.test(gateway)) {
        return gateway;
      }
    } catch (routeError) {
      console.error("Fallback via ip route failed:", routeError);
    }

    // Fallback 3: стандартный Docker bridge
    return "172.17.0.1";
  }
}