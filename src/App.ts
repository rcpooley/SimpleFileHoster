import * as express from 'express';
import * as http from 'http';
import * as bodyParser from 'body-parser';
import {DataSocket, DataStoreServer} from 'datasync-js';
import * as socketio from 'socket.io';
import Socket = SocketIO.Socket;
import {Servefiles} from "./servefiles";

export class App {

    public express: express.Application;
    public server: http.Server;
    public dataServer: DataStoreServer;

    constructor() {
        this.initExpress();
        this.middleware();
        this.routes();
        this.initServer();
        this.initDataSync();
    }

    private initExpress() {
        this.express = express();
    }

    private middleware() {
        this.express.use(bodyParser.json());
        this.express.use(bodyParser.urlencoded({extended: false}));
    }

    private routes() {
        this.express.use(express.static(__dirname + '/public'));
        this.express.use((req, res) => {
            res.redirect('/err404.html');
        });
    }

    private initServer() {
        this.server = http.createServer(this.express);
    }

    private initDataSync() {
        let io = socketio(this.server);

        this.dataServer = new DataStoreServer();
        this.dataServer.serveGlobal('store');

        io.on('connect', (socket: Socket) => {
            console.log(`Socket ${socket.id} connected`);

            let dsock = DataSocket.fromSocket(socket);

            this.dataServer.addSocket(dsock);

            socket.on('disconnect', () => {
                console.log(`Socket ${socket.id} disconnected`);
                this.dataServer.removeSocket(dsock);
            });
        });

        let store = this.dataServer.getStore('store');

        let serveFiles = new Servefiles();

        serveFiles.init(store);
    }
}