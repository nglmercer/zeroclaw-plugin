import { resolve } from "path";

const GATEWAY = "http://127.0.0.1:42617";

const isWindows = process.platform === "win32";
const binaryName = isWindows ? "zeroclaw.exe" : "zeroclaw";

/** Absolute path to the zeroclaw binary (sibling of this package). */
const ZEROCLAW_EXE = resolve(import.meta.dir, `../${binaryName}`);

/**
 * Attempts to retrieve a live pairing code from the local gateway.
 *
 * Strategy (in order):
 *  1. Public HTTP endpoint  GET /pair/code
 *  2. Authenticated API     POST /api/pairing/initiate
 *  3. CLI subprocess        zeroclaw gateway get-paircode --new
 */
export async function getPairingCode(): Promise<string> {
  // 1. Try the public endpoint during initial setup
  try {
    const publicResp = await fetch(`${GATEWAY}/pair/code`);
    if (publicResp.ok) {
      const data = await publicResp.json();
      if (data.pairing_code) {
        console.log("[pairing] Got code from public endpoint");
        return data.pairing_code as string;
      }
    }
  } catch {
    // Gateway not reachable yet — fall through
  }
  // 3. Spawn the CLI command recommended by the gateway itself
  //    zeroclaw gateway get-paircode --new
  try {
    console.log("[pairing] Falling back to CLI: zeroclaw gateway get-paircode --new");
    const proc = Bun.spawn([ZEROCLAW_EXE, "gateway", "get-paircode", "--new"], {
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    });

    const [exitCode, rawOut, rawErr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    if (exitCode !== 0) {
      console.error("[pairing] CLI exited with code", exitCode, rawErr.trim());
    } else {
      // 1. Look for explicit headers (e.g. X-Pairing-Code: 123456)
      // 2. Look for the code inside the ASCII box (e.g. │  123456  │ or Ôöé  123456  Ôöé)
      // This is highly resilient to future CLI format/text changes.
      const match = 
        rawOut.match(/(?:X-Pairing-Code:|Pairing[- ]Code:?)\s*([A-Za-z0-9_-]{4,12})/i) ||
        rawOut.match(/(?:│|\||Ôöé|¦)\s+([A-Za-z0-9_-]{4,12})\s+(?:│|\||Ôöé|¦)/);

      if (match) {
        const code = match[1];
        console.log("[pairing] Got code from CLI:", code);
        return code;
      }

      console.error("[pairing] CLI succeeded but no numeric code found in output:\n", rawOut);
    }
  } catch (err) {
    console.error("[pairing] CLI subprocess failed:", err);
  }

  // 4. All paths exhausted
  throw new Error(
    "No pairing code available. Run: zeroclaw gateway get-paircode --new"
  );
}

/**
 * Pairs this client with the gateway using a pairing code.
 * Returns the bearer token for subsequent authenticated requests.
 */
export async function pairWithGateway(
  pairingCode: string,
  deviceName: string | null = null,
  deviceType: string | null = null
): Promise<string> {
  // The gateway expects the code as the X-Pairing-Code header
  // (as documented in its CLI output: POST /pair with header X-Pairing-Code: <code>)
  const response = await fetch(`${GATEWAY}/pair`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Pairing-Code": pairingCode,
    },
    body: JSON.stringify({
      device_name: deviceName,
      device_type: deviceType,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Pairing failed: ${error}`);
  }

  const result = await response.json();
  return result.token as string;
}
