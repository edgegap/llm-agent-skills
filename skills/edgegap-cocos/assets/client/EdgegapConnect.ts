// Example Cocos Creator 3.8 component: picks where to connect, finds a match through the Edgegap
// matchmaker if configured, and opens the game socket. Attach it to a node (e.g. Canvas), set the
// fields in the Inspector, call findAndConnect() from your Play button. Adapt the UI parts.
//
// Where it connects, first match wins:
//   1. ?server=wss://<fqdn>:<port>                 a direct deployment (web builds only)
//   2. the matchmaker: ?mm=<url>&mmToken=<token>   or the matchmakerUrl / matchmakerToken fields
//   3. localServer (default ws://localhost:7777)   the server running on this machine
//
// The matchmaker Auth Token is made to ship in clients (it can only create and read tickets).
// The Edgegap API token never goes into a client build.

import { _decorator, Component, Label, sys } from 'cc';
import { Matchmaker } from './Matchmaker';
import { GameSocket } from './GameSocket';

const { ccclass, property } = _decorator;

@ccclass('EdgegapConnect')
export class EdgegapConnect extends Component {
    @property({ tooltip: 'Edgegap matchmaker API URL. Empty = connect to localServer.' })
    matchmakerUrl = '';
    @property({ tooltip: 'Matchmaker Auth Token (client-safe). Never the Edgegap API token.' })
    matchmakerToken = '';
    @property
    matchmakerProfile = 'casual';
    @property({ tooltip: 'Used when no matchmaker is set. Plain ws:// works only from http:// pages and native builds.' })
    localServer = 'ws://localhost:7777';
    @property({ type: Label })
    statusLabel: Label | null = null;

    private matchmaker: Matchmaker | null = null;
    private socket: GameSocket | null = null;

    async findAndConnect(playerName = 'player') {
        const params = new URLSearchParams(sys.isBrowser ? window.location.search : '');
        let url = params.get('server') ?? '';
        let ticket: string | null = null;
        let attempts = 10;
        const mmUrl = params.get('mm') || this.matchmakerUrl;
        const mmToken = params.get('mmToken') || this.matchmakerToken;

        try {
            if (!url && mmUrl && mmToken) {
                this.matchmaker = new Matchmaker({
                    url: mmUrl, token: mmToken, profile: params.get('profile') || this.matchmakerProfile,
                    onStatus: (s) => this.status(s),
                });
                url = await this.matchmaker.findMatch();
                ticket = this.matchmaker.ticketId;
                this.matchmaker = null;
            } else if (!url) {
                url = this.localServer;
                attempts = 1;
            }
            this.status('Connecting...');
            this.socket = new GameSocket({
                onMessage: (msg) => this.onServerMessage(msg),
                onClose: (code) => this.status(`Disconnected (${code})`),
            });
            const welcome = await this.socket.connect(url, { name: playerName, ticket }, attempts);
            this.status(`Connected as ${welcome.id}`);
        } catch (e: any) {
            this.status(`Could not join: ${e?.message ?? e}`);
        }
    }

    /** Send inputs (intents), at most ~30 per second. */
    sendInput(input: Record<string, unknown>) {
        this.socket?.send({ t: 'input', ...input });
    }

    protected onServerMessage(msg: any) {
        // state -> update your nodes (ease toward the server values); over -> show the result.
        if (msg.t === 'over') this.status('Match over');
    }

    onDestroy() {
        this.matchmaker?.cancel(); // leave the queue if the scene closes while searching
        this.socket?.close();
    }

    private status(s: string) {
        if (this.statusLabel) this.statusLabel.string = s;
    }
}
