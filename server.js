let PORT = 3344;

let express = require('express');
let http = require('http');
let fs = require('fs');
let config;

try {
    config = require('./files.json');
} catch (e) {
    console.error('Could not load files.json');
    return;
}

let app = express();

let HOSTED = config.files;

function getFiles(path) {
    return fs.readdirSync(path);
}

function encode(str) {
    return encodeURI(str);
}

function decode(str) {
    return decodeURI(str);
}

function buildDirHtml(path) {
    let build = `<div style="font-size: 20px;">${path}</div>`;

    let files = getFiles(path);

    files.forEach(file => {
        let newPath = path + '\\' + file;
        build += `<a href="/${encode(newPath)}">${file}</a><br>`;
    });

    return build;
}

app.get('*', (req, res) => {
    let url = req.url.substring(1);

    let build = '<html><head><title>Robert\'s Files</title></head><body>';

    let done = false;

    if (url.length > 0) {
        let path = decode(url);
        let stats;
        try {
            stats = fs.lstatSync(path);
        } catch(e) {}

        if (stats) {
            if (stats.isFile()) {
                return res.sendFile(path);
            } else if (stats.isDirectory()) {
                build += buildDirHtml(path);
                done = true;
            }
        }
    }

    if (!done) {
        for (let i = 0; i < HOSTED.length; i++) {
            build += buildDirHtml(HOSTED[i]) + '<br>';
        }
    }

    build += '</body></html>';
    res.send(build);
});

let server = new http.Server(app);

server.listen(PORT, () => {
    console.log(`Listening on *:${PORT}`);
});