import {
  spawnGateway,
  stopGateway,
  waitForGateway,
  type GatewayProcess,
} from "./src/process.js";
import { getPairingCode, pairWithGateway } from "./src/pairing.js";
import { ZeroClawWS } from "./src/ws-client.js";
import type { IPlugin, PluginContext } from "bun_plugins";
import { getRegistryPlugin } from "./src/registry.js";
//import type { ActionHandler,ActionDefinition } from "trigger_system/node";
const AI_RESPOND = "ai_respond";

export class zeroclawPlugin implements IPlugin {
  name = "zeroclaw-plugin";
  version = "1.0.0";
  description = "ZeroClaw plugin https://github.com/zeroclaw-labs/zeroclaw";
  private gateway: GatewayProcess | null = null;
  private client: ZeroClawWS | null = null;
  defaultConfig = {
    baseUrl: "http://127.0.0.1:42617",
    token: ""
  };

  async onLoad(context: PluginContext): Promise<void> {
    const { log, emit } = context;
    if (!context)return;
    log.info(` Initializing...`);
    const pluginData = await this.pluginData(context,{});
    const {baseUrl} = pluginData;
    if (!baseUrl) {
      log.error(` Missing baseUrl`);
      return;
    }
    // ── 1. Spawn the local gateway process (no-op if already running) ──────────
    this.gateway = await spawnGateway();
    await waitForGateway();

    // ── 2. Intercept / retrieve the pairing code ────────────────────────────────
    const pairingCode = await getPairingCode();
    log.info(` Pairing code:`, pairingCode);

    //await Bun.write("pairing_code.txt", pairingCode);

    // ── 3. Pair with the gateway → get a bearer token ───────────────────────────
    const getToken = await pairWithGateway(pairingCode);
    log.info(
      ` Token obtained:`,
      getToken.substring(0, 10) + "...",
    );
    await this.pluginData(context,{token:getToken,baseUrl});
    // ── 4. Open the WebSocket connection ────────────────────────────────────────
    this.client = new ZeroClawWS(baseUrl, getToken);
    const registryPlugin = await getRegistryPlugin(context);

    this.client.onChunk = (content) => {
      emit(`${this.name}:chunk`, content);
      log.info(`Chunk received:`, content);
    };
    this.client.onDone = (full) => {
      emit(`${this.name}:done`, full);
      emit("system", {
        eventName: "TTS",
        data: { message: full },
      });
      log.info(`Full response:`, full);
    }
    this.client.onError = (msg) =>{
      emit(`${this.name}:error`, msg);
      log.error(`Remote error:`, msg);
    }
    this.client.onSessionStart = (id, resumed) =>{
      emit(`${this.name}:sessionStart`, {id,resumed});
      log.info(` Session ${id}`,{resumed});
    };
    this.client.connect();
    if (!registryPlugin) {
      log.error(` Registry plugin not found`);
      return;
    }
    registryPlugin.registry?.register(AI_RESPOND,(action,ctx)=>{
      log.info(`Action received:`, action);
      log.info(`Context received:`, ctx);
      const {prompt,user} = action.params as {prompt?:string,user?:string};
      if (!prompt) {
        log.error(` Missing prompt or user`,{prompt,user});
        return;
      }
      const message = `${user || "user"}:${prompt}`;
      this.client?.sendMessage(message);
      return {sucess:true,message};
    })
    //await Bun.sleep(1000);
    //this.client.sendMessage("Hello from ZeroClaw Bun Plugin!");
  }
  async pluginData(context:PluginContext,{token,baseUrl}:{
    token?:string;
    baseUrl?:string;
  }){
    const {storage } = context;
    const savedOptions = (await storage.get(
      this.name,
    )) as {
      baseUrl: string;
      token: string;
    };
    if (!savedOptions || !savedOptions.token || !savedOptions.baseUrl) {
       await storage.set(this.name, this.defaultConfig);  
       return this.defaultConfig;
    }
    await storage.set(this.name, {...savedOptions,token,baseUrl});
    return savedOptions;
  }
  async onUnload(): Promise<void> {
    console.log(`${this.name} Shutting down...`);
    if (this.client) {
      this.client.disconnect();
    }
    stopGateway(this.gateway);
  }
}
if (import.meta.main) {
  console.log("🚀 Starting standalone test flow...");

  try {
    // 1. Spawn the local gateway process
    console.log("⏳ Spawning gateway...");
    const gateway = await spawnGateway();
    await waitForGateway();
    console.log("✅ Gateway is ready.");

    // 2. Intercept / retrieve the pairing code
    console.log("⏳ Retrieving pairing code...");
    const pairingCode = await getPairingCode();
    console.log("✅ Pairing code:", pairingCode);

    // 3. Pair with the gateway → get a bearer token
    console.log("⏳ Pairing with gateway...");
    const token = await pairWithGateway(pairingCode);
    console.log("✅ Token obtained:", token.substring(0, 10) + "...");

    // 4. Open the WebSocket connection
    const baseUrl = "http://127.0.0.1:42617";
    console.log(`⏳ Connecting WebSocket to ${baseUrl}...`);
    const ws = new ZeroClawWS(baseUrl, token);
    
    ws.onDone = (full) => console.log("\n✅ Full response:", full);
    ws.onChunk = (content) => process.stdout.write(content);
    ws.onError = (msg) => console.error("❌ Remote error:", msg);
    ws.onSessionStart = (sessionId, resumed) => {
      console.log(`\n🔌 Session started: ${sessionId} (resumed: ${resumed})`);
      console.log("📤 Sending test message...");
      ws.sendMessage("Hello from ZeroClaw standalone test!");
    };
    
    ws.connect();

    // 5. Cleanup on exit
    process.on("SIGINT", () => {
      console.log("\n🛑 Shutting down...");
      ws.disconnect();
      stopGateway(gateway);
      process.exit(0);
    });

  } catch (error) {
    console.error("❌ Error in test flow:", error);
    process.exit(1);
  }
}
