import {DataStore} from "datasync-js";
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

let config = require('./config.json');

interface File {
    path: string;
    name: string;
}

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
    private static getNameFromPath(path: string): string {
        let spl = path.replace(/\//g, '\\').split('\\');
        return spl[spl.length - 1];
    }

    public init(store: DataStore) {
        store.ref('/').on('update', ((value, path) => {
            if (path.endsWith('fetch')) {
                store.ref(path).value(reqPath => {
                    let filesRef = store.ref(path).parent().ref('files');
                    let newFiles;

                    if (reqPath == '') {
                        newFiles = Object.keys(this.roots).map(hash => {
                            return {
                                path: Servefiles.encode(hash + '::/'),
                                name: Servefiles.getNameFromPath(this.roots[hash])
                            };
                        });
                    } else {
                        let spl = Servefiles.decode(reqPath).split('::');
                        newFiles = this.getFiles(spl[0], spl[1]);
                        console.log('newFiles',newFiles);
                    }

                    filesRef.update(newFiles);
                });
            }
        }));
    }

    private getFiles(rootHash: string, pth: string) {
        if (!(rootHash in this.roots)) {
            return [];//TODO update with error file
        }

        let rootPath = path.resolve(this.roots[rootHash]);

        let absolutePath = path.resolve(rootPath + '/' + pth);

        let files = fs.readdirSync(absolutePath).map(file => {
            let filePath = path.resolve(absolutePath + '/' + file);
            let relPath = filePath.substring(rootPath.length);

            return {
                path: Servefiles.encode(rootHash + '::' + relPath),
                name: file
            };
        });

        let base = path.basename(absolutePath);

        let rel = path.resolve(absolutePath.substring(0, absolutePath.length - base.length)).substring(rootPath.length);
        let parentPath = Servefiles.encode(rootHash + '::' + rel);

        if (rel.length == 0) {
            parentPath = '';
        }

        console.log(base,rel,parentPath);

        files.unshift({
            path: parentPath,
            name: '..'
        });

        return files;
    }
}