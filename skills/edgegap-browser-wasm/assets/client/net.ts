// Turning what the player typed into a WebSocket URL, connecting, and explaining failures.
//
// Browsers give scripts almost no detail when a WebSocket fails (no status, no TLS error), so
// the messages below say what to check. The exact browser console messages are listed in the
// README's troubleshooting section.

import type { ClientMessage, ServerMessage } from "@sample/shared";

const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/i;
const IP_ADDRESS = /^(\d+\.\d+\.\d+\.\d+|\[[0-9a-f:]+\])(:\d+)?$/i;

export interface ServerTarget {
  url: string;
  /** Shown under the Connect button before connecting, e.g. "you typed an IP address". */
  warning?: string;
}

/**
 * Accepts `host:port`, `wss://host:port` or `https://host:port`. Without a scheme, the client
 * uses `wss://`, except for a local server on a page that is itself served over plain http.
 */
export function toServerUrl(input: string, page: Location = window.location): ServerTarget {
  let value = input.trim().replace(/\/+$/, "");
  if (!value) throw new Error("Enter the server address: deployment host and external port, e.g. abc123.pr.edgegap.net:31500");
  value = value.replace(/^https:\/\//i, "wss://").replace(/^http:\/\//i, "ws://");

  let url: string;
  if (/^wss?:\/\//i.test(value)) {
    url = value;
  } else {
    const local = LOCAL_HOST.test(value);
    url = `${local && page.protocol === "http:" ? "ws" : "wss"}://${value}`;
  }

  const host = url.replace(/^wss?:\/\//i, "").split("/")[0];
  let warning: string | undefined;
  if (url.startsWith("wss://") && IP_ADDRESS.test(host) && !LOCAL_HOST.test(host)) {
    warning =
      "That is an IP address. TLS certificates are issued for host names, so wss:// to an IP fails. " +
      "Use the deployment's host name (…pr.edgegap.net) with the same external port.";
  }
  if (!/:\d+$/.test(host)) {
    warning = "No port given. Edgegap assigns a random external port to each deployment: add :<external port>.";
  }
  return { url, warning };
}

export interface Connection {
  send(msg: ClientMessage): void;
  close(): void;
}

export interface ConnectOptions {
  onMessage(msg: ServerMessage): void;
  /** Called once the connection is lost after it had worked. */
  onClose(reason: string): void;
  onStatus(text: string): void;
  attempts?: number;
}

/**
 * Open the WebSocket and send `hello`. A deployment that just became Ready can refuse
 * connections for a few seconds, so the first connection is retried.
 */
export function connect(url: string, name: string, opts: ConnectOptions): Promise<Connection> {
  const attempts = opts.attempts ?? 5;
  return new Promise((resolve, reject) => {
    let tries = 0;

    const attempt = () => {
      tries++;
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        // Chrome and Firefox throw synchronously for ws:// from an https page (mixed content).
        reject(new Error(explainThrow(url, err)));
        return;
      }
      let opened = false;
      let heartbeat = 0;
      const conn: Connection = {
        send: (msg) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg)),
        close: () => ws.close(1000, "left"),
      };

      ws.onopen = () => {
        opened = true;
        ws.send(JSON.stringify({ t: "hello", name } satisfies ClientMessage));
        // Inputs stop when the tab is hidden (no animation frames); timers keep running.
        heartbeat = window.setInterval(() => conn.send({ t: "ping" }), 5000);
        resolve(conn);
      };
      ws.onmessage = (e) => opts.onMessage(JSON.parse(e.data) as ServerMessage);
      ws.onclose = (e) => {
        clearInterval(heartbeat);
        if (opened) {
          opts.onClose(explainClose(e));
        } else if (tries < attempts) {
          opts.onStatus(`Connecting to ${url} (attempt ${tries + 1}/${attempts})…`);
          setTimeout(attempt, 1000);
        } else {
          reject(new Error(explainFailure(url)));
        }
      };
    };

    opts.onStatus(`Connecting to ${url}…`);
    attempt();
  });
}

function explainThrow(url: string, err: unknown): string {
  const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  if (url.startsWith("ws://") && window.location.protocol === "https:") {
    return (
      `Blocked by the browser (mixed content): ${detail}\n\n` +
      "This page is served over https, so it may only open wss:// connections. " +
      "Use wss://<deployment host>:<external port> and enable TLS Upgrade on the port in your Edgegap app version."
    );
  }
  return `Could not create the WebSocket: ${detail}`;
}

function explainFailure(url: string): string {
  const healthUrl = url.replace(/^ws/i, "http") + "/health";
  return (
    `Could not connect to ${url}.\n\n` +
    "The browser console (F12) names the cause:\n" +
    "• net::ERR_CERT_COMMON_NAME_INVALID: you used an IP address. Use the deployment host name (…pr.edgegap.net).\n" +
    "• net::ERR_SSL_PROTOCOL_ERROR: the port doesn't speak TLS. Enable TLS Upgrade on the WS port of your app version.\n" +
    "• net::ERR_CONNECTION_REFUSED or a timeout: wrong port (use the External port of gameport, not 7777) " +
    "or the deployment isn't Ready.\n\n" +
    `Opening ${healthUrl} in a new tab shows the same error as a page.`
  );
}

function explainClose(e: CloseEvent): string {
  if (e.code === 1001) return "The server shut down (deployment stopped).";
  if (e.code === 1008) return `The server refused the connection: ${e.reason || "policy violation"}.`;
  if (e.code === 1000) return "Disconnected.";
  return `Connection lost (code ${e.code}${e.reason ? `, ${e.reason}` : ""}).`;
}
