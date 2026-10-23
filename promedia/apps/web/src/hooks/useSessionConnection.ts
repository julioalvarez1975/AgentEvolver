import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ClientRole,
  HubMessage,
  ImagePayload,
  PlaylistItem,
  SceneMode,
  SessionSnapshot,
  TextPayload,
  VideoPayload,
} from "@promedia/shared";
import { buildWsUrl, createSession, joinSession } from "../lib/hub";
import { SessionSocket } from "../lib/session-socket";

export type WsStatus = "idle" | "connecting" | "open" | "closed" | "error";

function applyHubMessage(
  msg: HubMessage,
  prev: SessionSnapshot | null,
): SessionSnapshot | null {
  if (msg.type === "session.snapshot") {
    return msg.payload as SessionSnapshot;
  }
  if (msg.type === "session.updated") {
    const p = msg.payload as Partial<SessionSnapshot>;
    if (!prev) {
      return prev;
    }
    return {
      ...prev,
      seq: msg.seq,
      lastTouchAt: p.lastTouchAt ?? prev.lastTouchAt,
      touchNote: p.touchNote ?? prev.touchNote,
      live: p.live ?? prev.live,
      playlist: p.playlist ?? prev.playlist,
    };
  }
  return prev;
}

/**
 * Shared create/join + WS wiring for Control and Output shells.
 */
export function useSessionConnection(role: ClientRole) {
  const [code, setCode] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [wsTicket, setWsTicket] = useState("");
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [lastSeq, setLastSeq] = useState(-1);
  const [wsStatus, setWsStatus] = useState<WsStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<SessionSocket | null>(null);

  const detach = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
  }, []);

  useEffect(() => () => detach(), [detach]);

  const attachSocket = useCallback((url: string) => {
    socketRef.current?.disconnect();
    setWsStatus("connecting");
    const sock = new SessionSocket(url, {
      onOpen: () => setWsStatus("open"),
      onClose: () => setWsStatus("closed"),
      onError: () => setWsStatus("error"),
      onMessage: (msg: HubMessage) => {
        setLastSeq(msg.seq);
        setSnapshot((prev) => applyHubMessage(msg, prev));
      },
    });
    socketRef.current = sock;
    sock.connect();
  }, []);

  const send = useCallback((type: string, payload?: unknown) => {
    socketRef.current?.send(type, payload);
  }, []);

  const create = useCallback(async () => {
    setError(null);
    setWsStatus("connecting");
    try {
      const res = await createSession("lan");
      setSessionId(res.sessionId);
      setCode(res.code);
      setAccessToken(res.accessToken);
      setWsTicket(res.wsTicket);
      setSnapshot(res.snapshot);
      setLastSeq(res.snapshot.seq);
      attachSocket(buildWsUrl(res.sessionId, role, res.wsTicket));
      return res;
    } catch (err) {
      setWsStatus("error");
      setError(String(err));
      throw err;
    }
  }, [attachSocket, role]);

  const join = useCallback(
    async (opts: { code?: string; accessToken?: string }) => {
      setError(null);
      setWsStatus("connecting");
      try {
        const res = await joinSession({ ...opts, role });
        setSessionId(res.sessionId);
        setCode(res.code);
        setWsTicket(res.wsTicket);
        setSnapshot(res.snapshot);
        setLastSeq(res.snapshot.seq);
        attachSocket(buildWsUrl(res.sessionId, role, res.wsTicket));
        return res;
      } catch (err) {
        setWsStatus("error");
        setError(String(err));
        throw err;
      }
    },
    [attachSocket, role],
  );

  const reconnect = useCallback(() => {
    if (!wsTicket || !sessionId) {
      return;
    }
    if (!socketRef.current) {
      attachSocket(buildWsUrl(sessionId, role, wsTicket));
      return;
    }
    setWsStatus("connecting");
    socketRef.current.reconnectWithResync();
  }, [attachSocket, role, sessionId, wsTicket]);

  const addItem = useCallback(
    (item: PlaylistItem) => send("playlist.itemAdd", { item }),
    [send],
  );
  const updateItem = useCallback(
    (
      id: string,
      patch: {
        payload?: TextPayload | ImagePayload | VideoPayload;
        order?: number;
      },
    ) => send("playlist.itemUpdate", { id, patch }),
    [send],
  );
  const removeItem = useCallback(
    (id: string) => send("playlist.itemRemove", { id }),
    [send],
  );
  const reorder = useCallback(
    (orderedIds: string[]) => send("playlist.reorder", { orderedIds }),
    [send],
  );
  const goLive = useCallback(
    (itemId: string) => send("live.go", { itemId }),
    [send],
  );
  const clearLive = useCallback(() => send("live.clear", {}), [send]);
  const setSlide = useCallback(
    (index: number) => send("live.setSlide", { index }),
    [send],
  );
  const setMediaClock = useCallback(
    (patch: { playing: boolean; positionMs?: number }) =>
      send("live.mediaClock.set", patch),
    [send],
  );
  const setSceneMode = useCallback(
    (sceneMode: SceneMode) => send("live.setSceneMode", { sceneMode }),
    [send],
  );

  return {
    code,
    accessToken,
    sessionId,
    wsTicket,
    snapshot,
    lastSeq,
    wsStatus,
    error,
    create,
    join,
    reconnect,
    detach,
    send,
    addItem,
    updateItem,
    removeItem,
    reorder,
    goLive,
    clearLive,
    setSlide,
    setMediaClock,
    setSceneMode,
    hasSession: Boolean(sessionId && wsTicket),
  };
}
