import type {
  CreateSessionResponse,
  JoinSessionResponse,
  ClientRole,
} from "@promedia/shared";

/**
 * REST base. Default: same-origin (Vite proxies `/api` → hub).
 * Set `VITE_HUB_URL` only when calling the hub without the proxy.
 */
export function hubHttpBase(): string {
  const env = import.meta.env.VITE_HUB_URL as string | undefined;
  if (env && env.length > 0) {
    return env.replace(/\/$/, "");
  }
  return "";
}

export function hubWsBase(): string {
  const http = hubHttpBase();
  if (http) {
    return http.replace(/^http/, "ws");
  }
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}`;
}

export async function createSession(
  mode: "lan" | "cloud" | "portable" = "lan",
): Promise<CreateSessionResponse> {
  const res = await fetch(`${hubHttpBase()}/api/v1/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  });
  if (!res.ok) {
    throw new Error(`create failed: ${res.status}`);
  }
  return (await res.json()) as CreateSessionResponse;
}

export async function joinSession(opts: {
  code?: string;
  accessToken?: string;
  role: ClientRole;
}): Promise<JoinSessionResponse> {
  const body =
    opts.code !== undefined && opts.code.length > 0
      ? { code: opts.code, role: opts.role }
      : { accessToken: opts.accessToken, role: opts.role };

  const res = await fetch(`${hubHttpBase()}/api/v1/sessions/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`join failed: ${res.status}`);
  }
  return (await res.json()) as JoinSessionResponse;
}

export function buildWsUrl(
  sessionId: string,
  role: ClientRole,
  wsTicket: string,
): string {
  const q = new URLSearchParams({
    sessionId,
    role,
    credential: wsTicket,
  });
  return `${hubWsBase()}/api/v1/ws?${q.toString()}`;
}
