import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { HubMessage, SessionSnapshot } from "@promedia/shared";
import { buildWsUrl, createSession, joinSession } from "../lib/hub";
import { SessionSocket } from "../lib/session-socket";

/** Smoke control stubs — product shell is subtarea 3. */
export function ControlPage() {
  const [code, setCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [sessionId, setSessionId] = useState("");
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
          pushLog(`updated seq=${msg.seq} note=${p.touchNote ?? ""}`);
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

  const onCreate = async () => {
    try {
      setStatus("creating…");
      const res = await createSession("lan");
      setSessionId(res.sessionId);
      setCode(res.code);
      setAccessToken(res.accessToken);
      setWsTicket(res.wsTicket);
      setSnapshot(res.snapshot);
      pushLog(`created code=${res.code}`);
      attachSocket(buildWsUrl(res.sessionId, "control", res.wsTicket));
    } catch (err) {
      setStatus("create failed");
      pushLog(String(err));
    }
  };

  const onJoin = async () => {
    try {
      setStatus("joining…");
      const res = await joinSession({ code: joinCode, role: "control" });
      setSessionId(res.sessionId);
      setCode(res.code);
      setWsTicket(res.wsTicket);
      setSnapshot(res.snapshot);
      pushLog(`joined as control code=${res.code}`);
      attachSocket(buildWsUrl(res.sessionId, "control", res.wsTicket));
    } catch (err) {
      setStatus("join failed");
      pushLog(String(err));
    }
  };

  const onTouch = () => {
    socketRef.current?.send("session.touch", {
      note: `touch@${new Date().toISOString()}`,
    });
    pushLog("sent session.touch");
  };

  return (
    <main className="scaffold-page">
      <h1>ProMedia — control smoke</h1>
      <p>
        Stub de subtarea 2 (sesión + WS). Sin playlist / Go Live.
      </p>
      <nav className="scaffold-nav">
        <Link to="/">Inicio</Link>
        <Link to="/output">/output</Link>
      </nav>

      <div className="smoke-actions">
        <button type="button" onClick={() => void onCreate()}>
          Crear sesión
        </button>
        <label className="smoke-field">
          Código
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="AB12"
          />
        </label>
        <button type="button" onClick={() => void onJoin()}>
          Unir control (código)
        </button>
        <button type="button" onClick={onTouch} disabled={!wsTicket}>
          Touch (mutar seq)
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
          <dt>accessToken</dt>
          <dd className="mono">{accessToken || "—"}</dd>
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
