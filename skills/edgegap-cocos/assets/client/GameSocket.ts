// WebSocket connection to one Edgegap deployment, for Cocos Creator 3.8 (any target with the
// standard WebSocket API: web builds, native, mini-games through Cocos's platform adapter).
//
// A fresh deployment can refuse connections for a few seconds after the matchmaker reports
// HOST_ASSIGNED (or after a direct deployment turns Ready), so the first connection is retried.
// An {t:"error"} message from the server (full, match over, not matched) is final: no retry.
//
// The URL is wss://<fqdn>:<external port> when the app version's port is WS with TLS Upgrade on.
// Connect by FQDN, never by IP: the certificate is issued for the FQDN.

export interface GameSocketHandlers {
  onMessage: (msg: any) => void;
  onClose?: (code: number, reason: string) => void;
}

export class GameSocket {
  private ws: WebSocket | null = null;
  private closedByUs = false;
  private handlers: GameSocketHandlers;

  constructor(handlers: GameSocketHandlers) {
    this.handlers = handlers;
  }

  /**
   * Opens the socket, sends hello and resolves once the server answers "welcome".
   * attempts/delayMs: 10 x 1.5 s covers a freshly started deployment; use 1 for localhost.
   */
  async connect(url: string, hello: Record<string, unknown>, attempts = 10, delayMs = 1500): Promise<any> {
    for (let i = 1; ; i++) {
      try {
        return await this.open(url, hello);
      } catch (e: any) {
        if (e?.final || i >= attempts) throw e;
        console.warn(`[edgegap] connect attempt ${i} failed, retrying`, e?.message ?? e);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  send(msg: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close() {
    this.closedByUs = true;
    this.ws?.close(1000, "bye");
    this.ws = null;
  }

  private open(url: string, hello: Record<string, unknown>): Promise<any> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      let welcomed = false;
      ws.onopen = () => ws.send(JSON.stringify({ t: "hello", ...hello }));
      ws.onmessage = (ev: MessageEvent) => {
        let msg: any;
        try { msg = JSON.parse(String(ev.data)); } catch { return; }
        if (!welcomed) {
          if (msg.t === "welcome") {
            welcomed = true;
            this.ws = ws;
            resolve(msg);
          } else if (msg.t === "error") {
            reject(Object.assign(new Error(String(msg.message)), { final: true }));
          }
          return;
        }
        this.handlers.onMessage(msg);
      };
      ws.onerror = () => { if (!welcomed) reject(new Error(`cannot connect to ${url}`)); };
      ws.onclose = (ev: CloseEvent) => {
        if (!welcomed) { reject(new Error(`closed before welcome (${ev.code})`)); return; }
        if (!this.closedByUs) this.handlers.onClose?.(ev.code, ev.reason);
      };
    });
  }
}
