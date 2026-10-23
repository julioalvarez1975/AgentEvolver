import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { HubMessage, SessionSnapshot } from "@promedia/shared";
import { buildWsUrl, joinSession } from "../lib/hub";
import { SessionSocket } from "../lib/session-socket";

/** Smoke output stubs — audience shell is subtarea 3. */
export function OutputPage() {
  const [params] = useSearchParams();
  const [joinCode, setJoinCode] = useState("");
  const [token, setToken] = useState(params.get("token") ?? "");
  const [sessionId, setSessionId] = useState("");
  const [code, setCode] = useState("");
  const [wsTicket, setWsTicket] = useState("");
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [lastSeq, setLastSeq] = useState(-1);
  const [status, setStatus] = useState("idle");
  const [log, setLog] = useState<string[]>([]);
  const socketRef = useRef<SessionSocket | null>(null);

  const pushLog = (line: string) => {
    setLog((prev) => [`${new Date().toISOString().slice(11, 19)} ${line}`, ...prev].slice(0, 40));
  };

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const attachSocket = (url: string) => {
    socketRef.current?.disconnect();
    const sock = new SessionSocket(url, {
      onOpen: () => {
        setStatus("ws open");
        pushLog("ws open");
      },
      onClose: () => {
        setStatus("ws closed");
        pushLog("ws closed");
      },
      onMessage: (msg: HubMessage) => {
        setLastSeq(msg.seq);
        if (msg.type === "session.snapshot") {
          setSnapshot(msg.payload as SessionSnapshot);
          pushLog(`snapshot seq=${msg.seq}`);
        } else if (msg.type === "session.updated") {
          const p = msg.payload as Partial<SessionSnapshot>;
          setSnapshot((prev) =>
            prev
              ? {
                  ...prev,
                  seq: msg.seq,
                  lastTouchAt: p.lastTouchAt ?? prev.lastTouchAt,
                  touchNote: p.touchNote ?? prev.touchNote,
                  live: p.live ?? prev.live,
                }
              : prev,
          );
          pushLog(`updated seq=${msg.seq}`);
        } else if (msg.type === "error") {
          pushLog(`error ${JSON.stringify(msg.payload)}`);
        } else {
          pushLog(`${msg.type} seq=${msg.seq}`);
        }
      },
    });
    socketRef.current = sock;
    sock.connect();
  };

  const onJoinCode = async () => {
    try {
      setStatus("joining…");
      const res = await joinSession({ code: joinCode, role: "output" });
      setSessionId(res.sessionId);
      setCode(res.code);
      setWsTicket(res.wsTicket);
      setSnapshot(res.snapshot);
      pushLog(`joined output code=${res.code}`);
      attachSocket(buildWsUrl(res.sessionId, "output", res.wsTicket));
    } catch (err) {
      setStatus("join failed");
      pushLog(String(err));
    }
  };

  const onJoinToken = async () => {
    try {
      setStatus("joining…");
      const res = await joinSession({ accessToken: token, role: "output" });
      setSessionId(res.sessionId);
      setCode(res.code);
      setWsTicket(res.wsTicket);
      setSnapshot(res.snapshot);
      pushLog(`joined output via token`);
      attachSocket(buildWsUrl(res.sessionId, "output", res.wsTicket));
    } catch (err) {
      setStatus("join failed");
      pushLog(String(err));
    }
  };

  const onDisconnect = () => {
    socketRef.current?.disconnect();
    pushLog("manual disconnect");
  };

  const onReconnect = () => {
    if (!wsTicket || !sessionId) {
      return;
    }
    pushLog(`reconnect+resync from lastSeq=${socketRef.current?.appliedSeq ?? lastSeq}`);
    if (!socketRef.current) {
      attachSocket(buildWsUrl(sessionId, "output", wsTicket));
      return;
    }
    socketRef.current.reconnectWithResync();
  };

  const onTryTouch = () => {
    socketRef.current?.send("session.touch", { note: "output-should-fail" });
    pushLog("sent illegal session.touch (expect error)");
  };

  return (
    <main className="scaffold-page">
      <h1>ProMedia — output smoke</h1>
      <p>Stub de subtarea 2 (lectura + resync). Sin UI de audiencia.</p>
      <nav className="scaffold-nav">
        <Link to="/">Inicio</Link>
        <Link to="/control">/control</Link>
      </nav>

      <div className="smoke-actions">
        <label className="smoke-field">
          Código
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="AB12"
          />
        </label>
        <button type="button" onClick={() => void onJoinCode()}>
          Unir output (código)
        </button>
        <label className="smoke-field">
          Token opaco
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="accessToken"
          />
        </label>
        <button type="button" onClick={() => void onJoinToken()}>
          Unir output (token)
        </button>
        <button type="button" onClick={onDisconnect} disabled={!wsTicket}>
          Desconectar
        </button>
        <button type="button" onClick={onReconnect} disabled={!wsTicket}>
          Reconectar + resync
        </button>
        <button type="button" onClick={onTryTouch} disabled={!wsTicket}>
          Probar mute ilegal
        </button>
      </div>

      <dl className="smoke-meta">
        <div>
          <dt>status</dt>
          <dd>{status}</dd>
        </div>
        <div>
          <dt>code</dt>
          <dd>{code || "—"}</dd>
        </div>
        <div>
          <dt>sessionId</dt>
          <dd className="mono">{sessionId || "—"}</dd>
        </div>
        <div>
          <dt>lastSeq</dt>
          <dd>{lastSeq}</dd>
        </div>
        <div>
          <dt>touchNote</dt>
          <dd>{snapshot?.touchNote ?? "—"}</dd>
        </div>
      </dl>

      <pre className="smoke-log">{log.join("\n") || "log vacío"}</pre>
    </main>
  );
}
