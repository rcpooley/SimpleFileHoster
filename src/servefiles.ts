import {DataStore} from "datasync-js";
import * as crypto from 'crypto';
import * as fs from 'fs';

let config = require('./config.json');

export class Servefiles {

    private roots: {[hash: string]: string};

    constructor() {
        this.roots = {};

        config.files.forEach(root => {
            this.roots[Servefiles.hash(root)] = root;
        });
    }

    private static hash(data: string): string {
        return crypto.createHash('md5').update(data).digest('hex');
    }

    private static encode(str: string): string {
        return encodeURI(str);
    }

    private static decode(str: string): string {
        return decodeURI(str);
    }

    public init(store: DataStore) {
        store.ref('/').on('update', ((value, path) => {
            if (path.endsWith('fetch')) {
                let spl = Servefiles.decode(value).split('::');
                let files = this.getFiles(spl[0], spl[1]);
                store.ref(path).parent().ref('files').update(files);
            }
        }));
    }

    private getFiles(rootHash: string, path: string) {
        if (!(rootHash in this.roots)) {
            return [];//TODO update with error file
        }

        let absolutePath = this.roots[rootHash] + '\\' + path;

        let files = fs.readdirSync(absolutePath);

        return files;
    }
}