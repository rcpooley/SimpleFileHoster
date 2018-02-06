"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
let config = require('./config.json');
class Servefiles {
    constructor() {
        this.roots = {};
        config.files.forEach(root => {
            this.roots[Servefiles.hash(root)] = root;
        });
    }
    static hash(data) {
        return crypto.createHash('md5').update(data).digest('hex');
    }
    static encode(str) {
        return encodeURI(str);
    }
    static decode(str) {
        return decodeURI(str);
    }
    static getNameFromPath(path) {
        let spl = path.replace(/\//g, '\\').split('\\');
        return spl[spl.length - 1];
    }
    init(store) {
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
                    }
                    else {
                        let spl = Servefiles.decode(reqPath).split('::');
                        newFiles = this.getFiles(spl[0], spl[1]);
                        console.log('newFiles', newFiles);
                    }
                    filesRef.update(newFiles);
                });
            }
        }));
    }
    getFiles(rootHash, pth) {
        if (!(rootHash in this.roots)) {
            return []; //TODO update with error file
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
        console.log(base, rel, parentPath);
        files.unshift({
            path: parentPath,
            name: '..'
        });
        return files;
    }
}
exports.Servefiles = Servefiles;
