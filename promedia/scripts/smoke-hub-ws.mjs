#!/usr/bin/env node
/**
 * Headless smoke: text playlist + image upload/serve + Go Live.
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

/** Minimal 1x1 PNG */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

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

  // text still works
  const textItem = {
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
    JSON.stringify({ type: "playlist.itemAdd", payload: { item: textItem } }),
  );
  await waitFor(
    out1.inbox,
    (m) => m.type === "session.updated" && m.payload.playlist?.items?.length === 1,
  );
  console.log("text add ok");

  // upload image
  const form = new FormData();
  form.append(
    "file",
    new Blob([PNG_1X1], { type: "image/png" }),
    "smoke.png",
  );
  const up = await fetch(
    `${HUB}/api/v1/sessions/${created.sessionId}/assets`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${created.wsTicket}` },
      body: form,
    },
  );
  if (!up.ok) {
    throw new Error(`upload ${up.status} ${await up.text()}`);
  }
  const { asset } = await up.json();
  console.log("upload ok", asset.id, asset.mime);

  // reject bad mime
  const bad = await fetch(
    `${HUB}/api/v1/sessions/${created.sessionId}/assets`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${created.wsTicket}` },
      body: (() => {
        const f = new FormData();
        f.append("file", new Blob([Buffer.from("x")], { type: "text/plain" }), "x.txt");
        return f;
      })(),
    },
  );
  if (bad.status !== 400) {
    throw new Error(`expected mime reject, got ${bad.status}`);
  }
  console.log("mime reject ok");

  const imageItem = {
    id: "item-image-1",
    type: "image",
    order: 1,
    payload: { assetId: asset.id, fit: "contain", title: "smoke.png" },
  };
  out1.inbox.length = 0;
  control.ws.send(
    JSON.stringify({ type: "playlist.itemAdd", payload: { item: imageItem } }),
  );
  await waitFor(
    out1.inbox,
    (m) =>
      m.type === "session.updated" &&
      m.payload.playlist?.items?.some((i) => i.type === "image"),
  );
  console.log("image add ok");

  // edit fit
  out1.inbox.length = 0;
  control.ws.send(
    JSON.stringify({
      type: "playlist.itemUpdate",
      payload: {
        id: imageItem.id,
        patch: {
          payload: { ...imageItem.payload, fit: "cover" },
        },
      },
    }),
  );
  await waitFor(
    out1.inbox,
    (m) =>
      m.type === "session.updated" &&
      m.payload.playlist?.items?.find((i) => i.id === imageItem.id)?.payload
        ?.fit === "cover",
  );
  console.log("fit update ok");

  // go live image
  out1.inbox.length = 0;
  control.ws.send(
    JSON.stringify({ type: "live.go", payload: { itemId: imageItem.id } }),
  );
  await waitFor(
    out1.inbox,
    (m) =>
      m.type === "session.updated" &&
      m.payload.live?.currentItemId === imageItem.id,
  );
  console.log("image go live ok");

  // serve bytes with output ticket
  const get = await fetch(
    `${HUB}/api/v1/sessions/${created.sessionId}/assets/${asset.id}?credential=${encodeURIComponent(joinOut.wsTicket)}`,
  );
  if (!get.ok) {
    throw new Error(`serve ${get.status}`);
  }
  const buf = Buffer.from(await get.arrayBuffer());
  if (buf.length !== PNG_1X1.length) {
    throw new Error(`serve size mismatch ${buf.length}`);
  }
  console.log("serve ok");

  // path escape / unauthorized
  const noAuth = await fetch(
    `${HUB}/api/v1/sessions/${created.sessionId}/assets/${asset.id}`,
  );
  if (noAuth.status !== 401) {
    throw new Error(`expected 401 without creds, got ${noAuth.status}`);
  }
  console.log("auth gate ok");

  control.ws.close();
  out1.ws.close();
  console.log("SMOKE OK");
}

main().catch((err) => {
  console.error("SMOKE FAIL", err);
  process.exit(1);
});
