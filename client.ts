import { spawnGateway, stopGateway, waitForGateway } from "./src/process.js";
import { getPairingCode, pairWithGateway } from "./src/pairing.js";
import { ZeroClawWS } from "./src/ws-client.js";


async function main(): Promise<void> {
  // ── 1. Spawn the local gateway process (no-op if already running) ──────────
  const gateway = await spawnGateway();

  // Wait until the port is actually accepting connections (replaces blind sleep)
  await waitForGateway();

  // ── 2. Intercept / retrieve the pairing code ────────────────────────────────
  const pairingCode = await getPairingCode();
  console.log("[main] Pairing code:", pairingCode);

  // Persist the pairing code so other tools can consume it
  await Bun.write("pairing_code.txt", pairingCode);

  // ── 3. Pair with the gateway → get a bearer token ───────────────────────────
  const token = await pairWithGateway(pairingCode);
  console.log("[main] Token obtained:", token.substring(0, 10) + "...");

  // ── 4. Open the WebSocket connection ────────────────────────────────────────
  const client = new ZeroClawWS("http://127.0.0.1:42617", token);

  // Wire up response hooks
  client.onChunk = (content) => process.stdout.write(content);
  client.onDone = (full) => console.log("\n[main] Full response:", full);
  client.onError = (msg) => console.error("[main] Remote error:", msg);
  client.onSessionStart = (id, resumed) =>
    console.log(`[main] Session ${id}${resumed ? " (resumed)" : ""}`);

  client.connect();

  // ── 5. Send a test message after the socket is ready ───────────────────────
  await Bun.sleep(1000);
  client.sendMessage("Hello, ZeroClaw!");

  // ── 6. Teardown on SIGINT / SIGTERM ─────────────────────────────────────────
  const shutdown = () => {
    console.log("\n[main] Shutting down…");
    client.disconnect();
    stopGateway(gateway);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep the process alive while the gateway is running (skip if we don't own it)
  if (gateway) {
    await gateway.exited;
  } else {
    // We reused an existing gateway; park here until the user interrupts
    await new Promise(() => {});
  }
}

main().catch((err) => {
  console.error("[main] Fatal:", err);
  process.exit(1);
});
