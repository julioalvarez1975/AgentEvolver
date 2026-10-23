#!/usr/bin/env node
/**
 * Headless smoke: session + playlist text + Go Live + setSlide + resync.
 * Hub must listen on :8787. Usage: node scripts/smoke-hub-ws.mjs
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
    const state = { lastSeq: -1, snapshot: null };
    ws.addEventListener("open", () => {
      resolve({
        ws,
        inbox,
        state,
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
      if (msg.type === "session.snapshot") {
        state.snapshot = msg.payload;
      }
      if (msg.type === "session.updated") {
        state.snapshot = {
          ...(state.snapshot ?? {}),
          seq: msg.seq,
          live: msg.payload.live,
          playlist: msg.payload.playlist,
        };
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
  if (!created.snapshot.playlist) {
    throw new Error("snapshot missing playlist");
  }

  const joinOut = await fetch(`${HUB}/api/v1/sessions/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: created.code, role: "output" }),
  }).then((r) => r.json());

  const control = await connect(
    toWsUrl(HUB, created.sessionId, "control", created.wsTicket),
  );
  const out1 = await connect(
    toWsUrl(HUB, joinOut.sessionId, "output", joinOut.wsTicket),
  );

  await waitFor(control.inbox, (m) => m.type === "session.snapshot");
  await waitFor(out1.inbox, (m) => m.type === "session.snapshot");
  console.log("snapshots ok");

  const item = {
    id: "item-text-1",
    type: "text",
    order: 0,
    payload: {
      title: "Smoke",
      align: "center",
      slides: [
        { id: "s1", lines: ["Hello"] },
        { id: "s2", lines: ["World"] },
      ],
    },
  };

  out1.inbox.length = 0;
  control.ws.send(
    JSON.stringify({ type: "playlist.itemAdd", payload: { item } }),
  );
  await waitFor(
    out1.inbox,
    (m) =>
      m.type === "session.updated" &&
      m.payload.playlist?.items?.length === 1,
  );
  console.log("playlist add ok");

  out1.inbox.length = 0;
  control.ws.send(
    JSON.stringify({ type: "live.go", payload: { itemId: item.id } }),
  );
  const liveMsg = await waitFor(
    out1.inbox,
    (m) =>
      m.type === "session.updated" &&
      m.payload.live?.currentItemId === item.id &&
      m.payload.live?.currentSlideIndex === 0,
  );
  console.log("go live ok seq", liveMsg.seq);

  out1.inbox.length = 0;
  control.ws.send(
    JSON.stringify({ type: "live.setSlide", payload: { index: 1 } }),
  );
  await waitFor(
    out1.inbox,
    (m) =>
      m.type === "session.updated" &&
      m.payload.live?.currentSlideIndex === 1,
  );
  console.log("setSlide ok");

  // output cannot mutate
  out1.inbox.length = 0;
  out1.ws.send(
    JSON.stringify({ type: "live.go", payload: { itemId: item.id } }),
  );
  const err = await waitFor(out1.inbox, (m) => m.type === "error");
  console.log("output mutate rejected", err.payload.code);

  // remove live item clears live
  out1.inbox.length = 0;
  control.ws.send(
    JSON.stringify({ type: "playlist.itemRemove", payload: { id: item.id } }),
  );
  await waitFor(
    out1.inbox,
    (m) =>
      m.type === "session.updated" &&
      m.payload.live?.currentItemId === null &&
      m.payload.playlist?.items?.length === 0,
  );
  console.log("remove live item clears live ok");

  control.ws.close();
  out1.ws.close();
  console.log("SMOKE OK");
}

main().catch((err) => {
  console.error("SMOKE FAIL", err);
  process.exit(1);
});
