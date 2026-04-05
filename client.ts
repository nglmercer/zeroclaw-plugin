import { spawnGateway, stopGateway, waitForGateway, type GatewayProcess } from "./src/process.js";
import { getPairingCode, pairWithGateway } from "./src/pairing.js";
import { ZeroClawWS } from "./src/ws-client.js";
import type { IPlugin, PluginContext } from "bun_plugins";

export default class zeroclawPlugin implements IPlugin {
  name = "zeroclaw-plugin";
  version = "1.0.0";

  private gateway: GatewayProcess | null = null;
  private client: ZeroClawWS | null = null;

  async onLoad(context: PluginContext): Promise<void> {
    console.log(`[${this.name}] Initializing...`);

    // ── 1. Spawn the local gateway process (no-op if already running) ──────────
    this.gateway = await spawnGateway();
    await waitForGateway();

    // ── 2. Intercept / retrieve the pairing code ────────────────────────────────
    const pairingCode = await getPairingCode();
    console.log(`[${this.name}] Pairing code:`, pairingCode);

    await Bun.write("pairing_code.txt", pairingCode);

    // ── 3. Pair with the gateway → get a bearer token ───────────────────────────
    const token = await pairWithGateway(pairingCode);
    console.log(`[${this.name}] Token obtained:`, token.substring(0, 10) + "...");

    // ── 4. Open the WebSocket connection ────────────────────────────────────────
    this.client = new ZeroClawWS("http://127.0.0.1:42617", token);

    this.client.onChunk = (content) => process.stdout.write(content);
    this.client.onDone = (full) => console.log(`\n[${this.name}] Full response:`, full);
    this.client.onError = (msg) => console.error(`[${this.name}] Remote error:`, msg);
    this.client.onSessionStart = (id, resumed) =>
      console.log(`[${this.name}] Session ${id}${resumed ? " (resumed)" : ""}`);

    this.client.connect();

    // ── 5. Expose initial functionality to test plugin ───────────────────────────
    await Bun.sleep(1000);
    this.client.sendMessage("Hello from ZeroClaw Bun Plugin!");
  }

  async onUnload(): Promise<void> {
    console.log(`\n[${this.name}] Shutting down...`);
    if (this.client) {
      this.client.disconnect();
    }
    stopGateway(this.gateway);
  }
}
