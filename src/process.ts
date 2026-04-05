import { resolve } from "path";

export interface GatewayProcess {
  /** The underlying Bun subprocess handle */
  proc: ReturnType<typeof Bun.spawn>;
  /** Resolves when the process exits */
  exited: Promise<number>;
}

const GATEWAY_HOST = "127.0.0.1";
const GATEWAY_PORT = 42617;

/**
 * Returns true if the gateway is already listening on its port.
 * Uses a lightweight TCP probe so no HTTP round-trip is needed.
 */
export async function isGatewayRunning(): Promise<boolean> {
  try {
    const conn = await Bun.connect({
      hostname: GATEWAY_HOST,
      port: GATEWAY_PORT,
      socket: {
        open(socket) { socket.end(); },
        data() {},
        close() {},
        error() {},
      },
    });
    conn.end();
    return true;
  } catch {
    return false;
  }
}

const isWindows = process.platform === "win32";
const binaryName = isWindows ? "zeroclaw.exe" : "zeroclaw";

/**
 * Spawns the local ZeroClaw gateway executable and intercepts its
 * stdout / stderr streams line-by-line via Bun's async iterator API.
 *
 * @param executablePath  Path to the binary (defaults to sibling binary)
 * @param args            Extra CLI arguments forwarded to the process
 * @param onStdout        Called for each stdout line (default: console.log)
 * @param onStderr        Called for each stderr line (default: console.error)
 */
export async function spawnGateway(
  executablePath: string = resolve(import.meta.dir, `../${binaryName}`),
  args: string[] = ["gateway", "start"],
  onStdout: (line: string) => void = (l) => console.log("[gateway]", l),
  onStderr: (line: string) => void = (l) => console.error("[gateway:err]", l)
): Promise<GatewayProcess | null> {
  // ── Pre-flight: reuse an already-running gateway instead of fighting over the port
  if (await isGatewayRunning()) {
    console.log(
      `[process] Gateway already running on ${GATEWAY_HOST}:${GATEWAY_PORT} — reusing existing process`
    );
    return null;
  }

  console.log("[process] Spawning:", executablePath, args.join(" "));

  const proc = Bun.spawn([executablePath, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });

  // Intercept stdout asynchronously
  (async () => {
    const decoder = new TextDecoder();
    let buf = "";
    for await (const chunk of proc.stdout as AsyncIterable<Uint8Array>) {
      buf += decoder.decode(chunk, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) onStdout(line);
      }
    }
    if (buf.trim()) onStdout(buf);
  })();

  // Intercept stderr asynchronously
  (async () => {
    const decoder = new TextDecoder();
    let buf = "";
    for await (const chunk of proc.stderr as AsyncIterable<Uint8Array>) {
      buf += decoder.decode(chunk, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) onStderr(line);
      }
    }
    if (buf.trim()) onStderr(buf);
  })();

  const exited = proc.exited.then((code) => {
    console.log(`[process] Gateway exited with code ${code}`);
    return code;
  });

  return { proc, exited };
}

/** Waits until the gateway port is accepting connections (or times out). */
export async function waitForGateway(
  timeoutMs = 10_000,
  intervalMs = 200
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isGatewayRunning()) return;
    await Bun.sleep(intervalMs);
  }
  throw new Error(
    `[process] Gateway did not become ready within ${timeoutMs}ms`
  );
}

/**
 * Gracefully stops a previously spawned gateway process.
 */
export function stopGateway(gp: GatewayProcess | null): void {
  if (!gp) {
    // We didn't own this process — leave it running
    console.log("[process] Gateway was pre-existing; leaving it running");
    return;
  }
  try {
    gp.proc.kill();
    console.log("[process] Gateway process killed");
  } catch (err) {
    console.error("[process] Failed to kill gateway:", err);
  }
}
