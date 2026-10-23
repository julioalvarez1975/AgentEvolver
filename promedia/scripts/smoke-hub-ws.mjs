#!/usr/bin/env node
/**
 * Headless smoke for subtarea 2: create → join ×2 → WS touch → resync.
 * Uses Node built-in WebSocket (Node ≥ 22). Hub must listen on :8787.
 * Usage: node scripts/smoke-hub-ws.mjs
 */
const HUB = process.env.HUB_URL ?? "http://127.0.0.1:8787";

function toWsUrl(httpBase, sessionId, role, ticket) {
  const base = httpBase.replace(/^http/, "ws");
  const q = new URLSearchParams({ sessionId, role, credential: ticket });
  return `${base}/api/v1/ws?${q}`;
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const inbox = [];
    const state = { lastSeq: -1 };
    ws.addEventListener("open", () => {
      resolve({
        ws,
        inbox,
        get lastSeq() {
          return state.lastSeq;
        },
      });
    });
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(String(ev.data));
      inbox.push(msg);
      if (typeof msg.seq === "number") {
        state.lastSeq = msg.seq;
      }
    });
    ws.addEventListener("error", () => {
      reject(new Error(`ws error ${url}`));
    });
  });
}

function waitFor(inbox, pred, ms = 4000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const hit = inbox.find(pred);
      if (hit) {
        resolve(hit);
        return;
      }
      if (Date.now() - start > ms) {
        reject(new Error("timeout waiting for message"));
        return;
      }
      setTimeout(tick, 25);
    };
    tick();
  });
}

async function main() {
  const createRes = await fetch(`${HUB}/api/v1/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "lan" }),
  });
  if (!createRes.ok) {
    throw new Error(`create ${createRes.status}`);
  }
  const created = await createRes.json();
  console.log("created", created.code, "seq", created.snapshot.seq);
  if (created.accessExpiresAt) {
    throw new Error("accessExpiresAt must not be present");
  }

  const joinOut = await fetch(`${HUB}/api/v1/sessions/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: created.code, role: "output" }),
  }).then((r) => r.json());

  const joinOut2 = await fetch(`${HUB}/api/v1/sessions/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken: created.accessToken, role: "output" }),
  }).then((r) => r.json());

  const control = await connect(
    toWsUrl(HUB, created.sessionId, "control", created.wsTicket),
  );
  const out1 = await connect(
    toWsUrl(HUB, joinOut.sessionId, "output", joinOut.wsTicket),
  );
  const out2 = await connect(
    toWsUrl(HUB, joinOut2.sessionId, "output", joinOut2.wsTicket),
  );

  await waitFor(control.inbox, (m) => m.type === "session.snapshot");
  await waitFor(out1.inbox, (m) => m.type === "session.snapshot");
  await waitFor(out2.inbox, (m) => m.type === "session.snapshot");
  console.log("snapshots ok");

  control.ws.send(
    JSON.stringify({ type: "session.touch", payload: { note: "smoke" } }),
  );
  const upd1 = await waitFor(
    out1.inbox,
    (m) => m.type === "session.updated" && m.seq === 1,
  );
  const upd2 = await waitFor(
    out2.inbox,
    (m) => m.type === "session.updated" && m.seq === 1,
  );
  if (upd1.payload.touchNote !== "smoke" || upd2.payload.touchNote !== "smoke") {
    throw new Error("touch note mismatch");
  }
  console.log("broadcast seq=1 ok");

  out1.inbox.length = 0;
  out1.ws.send(
    JSON.stringify({ type: "session.touch", payload: { note: "nope" } }),
  );
  const err = await waitFor(out1.inbox, (m) => m.type === "error");
  console.log("output mutate rejected", err.payload.code);

  const lastSeq = out1.lastSeq;
  out1.ws.close();
  await new Promise((r) => setTimeout(r, 150));
  control.ws.send(
    JSON.stringify({ type: "session.touch", payload: { note: "while-away" } }),
  );
  await waitFor(out2.inbox, (m) => m.type === "session.updated" && m.seq === 2);

  const out1b = await connect(
    toWsUrl(HUB, joinOut.sessionId, "output", joinOut.wsTicket),
  );
  await waitFor(out1b.inbox, (m) => m.type === "session.snapshot");
  out1b.ws.send(
    JSON.stringify({ type: "client.resync", payload: { lastSeq } }),
  );
  await waitFor(
    out1b.inbox,
    (m) =>
      (m.type === "session.updated" && m.seq === 2) ||
      (m.type === "session.snapshot" && m.seq === 2),
  );
  console.log("resync catch-up ok lastSeq was", lastSeq);

  control.ws.close();
  out2.ws.close();
  out1b.ws.close();
  console.log("SMOKE OK");
}

main().catch((err) => {
  console.error("SMOKE FAIL", err);
  process.exit(1);
});
