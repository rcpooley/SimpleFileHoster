"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const http = require("http");
const bodyParser = require("body-parser");
const datasync_js_1 = require("datasync-js");
const socketio = require("socket.io");
const servefiles_1 = require("./servefiles");
class App {
    constructor() {
        this.initExpress();
        this.middleware();
        this.routes();
        this.initServer();
        this.initDataSync();
    }
    initExpress() {
        this.express = express();
    }
    middleware() {
        this.express.use(bodyParser.json());
        this.express.use(bodyParser.urlencoded({ extended: false }));
    }
    routes() {
        this.express.use(express.static(__dirname + '/public'));
        this.express.use((req, res) => {
            res.redirect('/err404.html');
        });
    }
    initServer() {
        this.server = http.createServer(this.express);
    }
    initDataSync() {
        let io = socketio(this.server);
        this.dataServer = new datasync_js_1.DataStoreServer();
        this.dataServer.serveGlobal('store');
        io.on('connect', (socket) => {
            console.log(`Socket ${socket.id} connected`);
            let dsock = datasync_js_1.DataSocket.fromSocket(socket);
            this.dataServer.addSocket(dsock);
            socket.on('disconnect', () => {
                console.log(`Socket ${socket.id} disconnected`);
                store.ref(socket.id).remove();
                this.dataServer.removeSocket(dsock);
            });
        });
        let store = this.dataServer.getStore('store');
        let serveFiles = new servefiles_1.Servefiles();
        serveFiles.init(store);
    }
}
exports.App = App;
