const WebSocket = require("ws");

// لینکی سێرڤەرەکەت لە Codespaces (بە wss://)
const WS_URL = process.env.WS_URL || "wss://q7vw6jgpv5fp7pp-3000.app.github.dev";

let ws;
let activeJob = null;
let stopRequested = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendStatus(accountId, state, sent, extra = {}) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(
    JSON.stringify({
      type: "account_status",
      accountId,
      state,
      sent,
      ...extra,
    })
  );
}

// لێرەدا لۆجیکی ڕاستەقینەی ناردنی لایک بۆ لایڤی تیکتۆک دادەنرێت
async function performSingleLike(accountId, liveUrl, stepIndex) {
  // نموونە: لێرەدا سێشنی هەژمارەکە و liveUrl بەکاردەهێنرێت بۆ ناردنی لایک
  // تێبینی: جێبەجێکردنی ڕاستەقینە پێویستی بە سێشن/بڕاوزەر یان ڕێگەی کارکردنی هەژمارەکە هەیە
  await sleep(250);
  return { ok: true, stepIndex };
}

async function runAccountWorker(accountId, payload, accountIndex) {
  const {
    liveUrl,
    likesPerAccount = 25,
    delayMs = 3000,
    staggerMs = 2500,
  } = payload;

  // دەستپێکردنی جیاواز بۆ هەر ئەکاونتێک تا هەموویان لە یەک چرکەدا دەست پێ نەکەن
  const initialWait = accountIndex * staggerMs;
  sendStatus(accountId, `Waiting (${Math.round(initialWait / 1000)}s)`, 0);
  await sleep(initialWait);

  let sentCount = 0;

  for (let i = 1; i <= likesPerAccount; i++) {
    if (stopRequested) {
      sendStatus(accountId, "Stopped", sentCount);
      return;
    }

    sendStatus(accountId, "Liking...", sentCount);

    try {
      const res = await performSingleLike(accountId, liveUrl, i);
      if (res.ok) {
        sentCount++;
        sendStatus(accountId, "Active", sentCount);
      }
    } catch (err) {
      sendStatus(accountId, "Error", sentCount, { error: err.message });
      // پشوودانی زیاتر لە کاتی هەڵەدا بۆ کەمکردنەوەی ئەگەری بلۆکبوون
      await sleep(delayMs * 3);
      continue;
    }

    if (i < likesPerAccount && !stopRequested) {
      // کاتی پشوودانی هەڕەمەکی لە نێوان لایکەکاندا (بۆ کەمکردنەوەی مەترسیی Rate Limit)
      const jitter = Math.floor(Math.random() * 1200);
      const waitTime = delayMs + jitter;
      sendStatus(accountId, `Cooldown (${(waitTime / 1000).toFixed(1)}s)`, sentCount);
      await sleep(waitTime);
    }
  }

  sendStatus(accountId, stopRequested ? "Stopped" : "Completed", sentCount);
}

async function handleStartLikes(payload) {
  if (activeJob) {
    console.log("کارێکی تر هێشتا لە کاردایە، سەرەتا دەوەستێنرێت...");
    stopRequested = true;
    await activeJob;
  }

  stopRequested = false;
  const accounts = Array.isArray(payload.accounts) ? payload.accounts : [];

  console.log(`دەستپێکردنی لایک بۆ لایڤ: ${payload.liveUrl} | ئەکاونتەکان: ${accounts.join(", ")}`);

  activeJob = Promise.allSettled(
    accounts.map((accId, idx) => runAccountWorker(accId, payload, idx))
  ).finally(() => {
    activeJob = null;
    console.log("هەموو ئەکاونتەکان تەواو بوون یان وەستێنران.");
  });

  await activeJob;
}

function connectWorker() {
  console.log(`پەیوەندیکردن بە WebSocket: ${WS_URL}`);
  ws = new WebSocket(WS_URL);

  ws.on("open", () => {
    console.log("وۆرکەر بە سەرکەوتوویی بە سێرڤەرەوە بەسترایەوە.");
    ws.send(JSON.stringify({ type: "register", role: "worker" }));
  });

  ws.on("message", async (rawData) => {
    let msg;
    try {
      msg = JSON.parse(rawData.toString());
    } catch {
      return;
    }

    if (msg.action === "start_live_likes") {
      await handleStartLikes(msg.payload || {});
    } else if (msg.action === "stop_live_likes") {
      stopRequested = true;
      console.log("فەرمانی وەستاندن گەیشت.");
    }
  });

  ws.on("close", () => {
    console.log("پەیوەندیی WebSocket پچڕا. دوای ٣ چرکە هەوڵ دەدرێتەوە...");
    setTimeout(connectWorker, 3000);
  });

  ws.on("error", (err) => {
    console.error("هەڵەی WebSocket:", err.message);
  });
}

connectWorker();
