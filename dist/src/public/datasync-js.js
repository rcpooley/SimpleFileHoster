require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const datautil_1 = require("./datautil");
const dbg = require("debug");
let mydbg = dbg('datasync-js');
class Binder {
    constructor(updater, debugPrefix) {
        this.updater = updater;
        this.debugPrefix = debugPrefix;
        this.listeners = {};
    }
    debug(txt) {
        let pre = this.debugPrefix ? '(' + this.debugPrefix + ') ' : '';
        console.log(pre + txt);
    }
    getListeners(socketid) {
        if (!(socketid in this.listeners)) {
            this.listeners[socketid] = {};
        }
        return this.listeners[socketid];
    }
    bindStore(socket, store, bindID, emitOnBind = false) {
        this.debug(`(${store.storeid}-${store.userid}) binding store from #${socket.id}`);
        let sendUpdate = (path, value, remove = false) => {
            this.debug(`(${store.storeid}-${store.userid}) sending update (${path}, ${JSON.stringify(value)}, ${remove}) to #${socket.id}`);
            socket.emit('datasync_update_' + bindID, {
                path: path,
                value: JSON.stringify(value),
                remove: remove
            });
        };
        socket.on('datasync_fetchall_' + bindID, () => {
            store.ref('/').value(val => {
                sendUpdate('/', val);
            });
        });
        socket.on('datasync_update_' + bindID, (update) => {
            this.debug(`(${store.storeid}-${store.userid}) got update (${update.path}, ${update.value}, ${update.remove}) from #${socket.id}`);
            this.updater.updateStore(socket, store, update.path, JSON.parse(update.value), () => {
                store.ref(update.path).value(val => {
                    sendUpdate(update.path, val);
                });
            }, update.remove);
        });
        this.getListeners(socket.id)[bindID] = {
            store: store,
            listener: store.ref('/').on('update', (value, path, flags) => {
                if (flags.indexOf(socket.id) >= 0) {
                    return;
                }
                store.ref(path).value(value => {
                    sendUpdate(path, value, flags.indexOf('__ds__removed') >= 0);
                });
            }, emitOnBind)
        };
    }
    unbindStore(socket, bindID) {
        socket.emit('datasync_unbindstore', bindID);
        socket.off('datasync_update_' + bindID);
        socket.off('datasync_fetchall_' + bindID);
        let bind = this.getListeners(socket.id)[bindID];
        if (!bind)
            return;
        this.debug(`(${bind.store.storeid}-${bind.store.userid}) unbinding store from #${socket.id}`);
        bind.store.off(bind.listener);
        delete this.getListeners(socket.id)[bindID];
    }
    unbindAll(socket) {
        Object.keys(this.getListeners(socket.id)).forEach(bindID => {
            this.unbindStore(socket, bindID);
        });
    }
    getBindID(socket) {
        let valid, bindID;
        let curIDs = Object.keys(this.getListeners(socket.id));
        do {
            bindID = datautil_1.DataUtil.randomString(10);
            valid = curIDs.indexOf(bindID) == -1;
        } while (!valid);
        return bindID;
    }
}
exports.Binder = Binder;

},{"./datautil":9,"debug":13}],2:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const datautil_1 = require("./datautil");
class DataRef {
    constructor(store, path) {
        this.store = store;
        this.iPath = datautil_1.DataUtil.formatPath(path);
        this.iName = datautil_1.DataUtil.getNameFromPath(this.iPath);
    }
    path() {
        return this.iPath;
    }
    name() {
        return this.iName;
    }
    parent() {
        return this.store.ref(this.iPath.substring(0, this.iPath.length - this.iName.length));
    }
    hasChild(ref) {
        return ref.path().indexOf(this.iPath) == 0;
    }
    isChildOf(ref) {
        return ref.hasChild(this);
    }
    getRelativeChildPath(childRef) {
        return datautil_1.DataUtil.formatPath(childRef.path().substring(this.iPath.length));
    }
    equals(ref) {
        return this.iPath === ref.path();
    }
    ref(path) {
        let tmpPath = this.iPath + datautil_1.DataUtil.formatPath(path);
        if (this.iPath == '/') {
            tmpPath = path;
        }
        return this.store.ref(tmpPath);
    }
    value(callback) {
        this.store.value(this.iPath, callback);
    }
    update(newVal, flags = []) {
        this.store.update(this.iPath, newVal, flags);
    }
    remove(flags = []) {
        this.store.remove(this.iPath, flags);
    }
    on(event, callback, emitOnBind = false) {
        return this.store.on(event, this.iPath, callback, emitOnBind);
    }
    off(listener) {
        this.store.off(listener);
    }
}
exports.DataRef = DataRef;

},{"./datautil":9}],3:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class DataSocket {
    constructor(id, onFunc, offFunc, emitFunc, tag) {
        this.id = id;
        this.onFunc = onFunc;
        this.offFunc = offFunc;
        this.emitFunc = emitFunc;
        this.tag = tag;
    }
    static fromSocket(socket) {
        return new DataSocket(socket.id, (a, b) => {
            socket.on(a, b);
        }, (a, b) => {
            if (socket.off) {
                return socket.off(a, b);
            }
            if (b) {
                socket.removeListener(a, b);
            }
            else {
                socket.removeAllListeners(a);
            }
        }, (a, ...b) => {
            socket.emit(a, ...b);
        }, socket);
    }
    on(event, listener) {
        this.onFunc(event, listener);
    }
    off(event, listener) {
        this.offFunc(event, listener);
    }
    emit(event, ...data) {
        this.emitFunc(event, ...data);
    }
}
exports.DataSocket = DataSocket;

},{}],4:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dataref_1 = require("./dataref");
const ee = require("event-emitter");
const datautil_1 = require("./datautil");
class DataStore {
    constructor(manager, storeid, userid) {
        this.manager = manager;
        this.storeid = storeid;
        this.userid = userid;
        this.emitter = ee(null);
    }
    ref(path) {
        return new dataref_1.DataRef(this, path);
    }
    value(path, callback) {
        this.manager.__ds__getDataValue(this, path, callback);
    }
    update(path, newVal, flags = []) {
        this.manager.__ds__updateData(this, path, newVal);
        this.emitter.emit('update', {
            path: datautil_1.DataUtil.formatPath(path),
            flags: flags
        });
    }
    remove(path, flags = []) {
        this.manager.__ds__deleteData(this, path);
        this.emitter.emit('update', {
            path: datautil_1.DataUtil.formatPath(path),
            flags: flags.concat(['__ds__removed'])
        });
    }
    on(event, path, callback, emitOnBind = false) {
        let ref = this.ref(path);
        let listener;
        this.emitter.on('update', listener = (update) => {
            let updateRef = this.ref(update.path);
            if (updateRef.isChildOf(ref)) {
                if (event == 'updateChild' && ref.equals(updateRef) ||
                    event == 'updateValue' && !ref.equals(updateRef) ||
                    event == 'updateDirect' && !ref.equals(updateRef)) {
                    return;
                }
                ref.value(value => {
                    callback(value, ref.getRelativeChildPath(updateRef), update.flags);
                });
            }
            else if (updateRef.hasChild(ref)) {
                if (event == 'updateChild' || event == 'updateDirect') {
                    return;
                }
                ref.value(value => {
                    callback(value, '/', update.flags);
                });
            }
        });
        if (emitOnBind) {
            ref.value(value => {
                callback(value, '/', []);
            });
        }
        return listener;
    }
    off(listener) {
        this.emitter.off('update', listener);
    }
}
exports.DataStore = DataStore;

},{"./dataref":2,"./datautil":9,"event-emitter":30}],5:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const datastoremanager_1 = require("./datastoremanager");
const datautil_1 = require("./datautil");
class DataStoreClient extends datastoremanager_1.DataStoreManager {
    constructor() {
        super();
        this.reqMap = {};
        this.activeStoreInfo = {};
    }
    genReqID() {
        let valid, reqID;
        do {
            reqID = datautil_1.DataUtil.randomString(10);
            valid = !(reqID in this.reqMap);
        } while (!valid);
        return reqID;
    }
    getStoreInfo(storeID) {
        if (!(storeID in this.activeStoreInfo)) {
            this.activeStoreInfo[storeID] = {};
        }
        return this.activeStoreInfo[storeID];
    }
    setSocket(socket) {
        this.clearSocket();
        this.socket = socket;
        this.socket.on('datasync_bindstore', (reqID, bindID) => {
            let req = this.reqMap[reqID];
            if (bindID) {
                this.getStoreInfo(req.storeID)[req.userID] = bindID;
                let store = this.stores.getStore(req.storeID, req.userID, true);
                this.binder.bindStore(socket, store, bindID);
                socket.emit('datasync_fetchall_' + bindID, '');
            }
            delete this.reqMap[reqID];
        });
        return this;
    }
    clearSocket() {
        if (!this.socket) {
            return;
        }
        this.socket.emit('datasync_disconnect', '');
        this.socket.off('datasync_bindstore');
        this.binder.unbindAll(this.socket);
        this.socket = null;
    }
    connectStore(storeID, userID = 'global', connInfo = {}) {
        let reqID = this.genReqID();
        this.reqMap[reqID] = {
            storeID: storeID,
            userID: userID
        };
        this.socket.emit('datasync_bindrequest', reqID, storeID, connInfo);
        return this;
    }
    disconnectStore(storeID, userID = 'global') {
        let userMap = this.getStoreInfo(storeID);
        if (userID in userMap) {
            this.binder.unbindStore(this.socket, userMap[userID]);
            delete userMap[userID];
        }
        return this;
    }
    getStore(storeID, userID = 'global') {
        return this.stores.getStore(storeID, userID, true);
    }
}
exports.DataStoreClient = DataStoreClient;

},{"./datastoremanager":6,"./datautil":9}],6:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const binder_1 = require("./binder");
const datastores_1 = require("./datastores");
const storeupdater_1 = require("./storeupdater");
class DataStoreManager {
    constructor() {
        this.updater = new storeupdater_1.StoreUpdater();
        this.binder = new binder_1.Binder(this.updater, this.isClient() ? 'client' : 'server');
        this.stores = new datastores_1.DataStores();
    }
    isClient() {
        return !!this['connectStore'];
    }
    subscribeOnUpdate(callback) {
        this.updater.subscribeOnUpdate(callback);
    }
}
exports.DataStoreManager = DataStoreManager;

},{"./binder":1,"./datastores":7,"./storeupdater":10}],7:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const datastore_1 = require("./datastore");
const datautil_1 = require("./datautil");
class DataStoreWrap {
    constructor(manager, storeid, userid) {
        this.data = {};
        this.store = new datastore_1.DataStore(manager, storeid, userid);
    }
}
class DataStores {
    constructor() {
        this.stores = {};
    }
    getStores(storeid) {
        if (!(storeid in this.stores)) {
            this.stores[storeid] = {};
        }
        return this.stores[storeid];
    }
    /**
     * An internal method that should only be called from DataStore
     *
     * @param store The DataStore we are working with
     * @param rawPath The path to the value to fetch
     * @param callback A callback to return the data
     * @private
     */
    __ds__getDataValue(store, rawPath, callback) {
        let path = datautil_1.DataUtil.formatPath(rawPath);
        let wrap = this.getStores(store.storeid)[store.userid];
        let value = datautil_1.DataUtil.traverseObject(wrap.data, path);
        callback(datautil_1.DataUtil.clone(value), path);
    }
    /**
     * And internal method that should only be called from DataStore
     *
     * @param store The DataStore we are working with
     * @param rawPath The path to the value to update
     * @param newVal The new value
     * @private
     */
    __ds__updateData(store, rawPath, newVal) {
        let path = datautil_1.DataUtil.formatPath(rawPath);
        let wrap = this.getStores(store.storeid)[store.userid];
        if (path == '/') {
            wrap.data = newVal;
        }
        else {
            if (!datautil_1.DataUtil.isObject(wrap.data)) {
                wrap.data = {};
            }
            datautil_1.DataUtil.traverseObjectForReference(wrap.data, path)[datautil_1.DataUtil.getNameFromPath(path)] = newVal;
        }
    }
    /**
     * And internal method that should only be called from DataStore
     *
     * @param store The DataStore we are working with
     * @param rawPath The path to the value to remove
     * @private
     */
    __ds__deleteData(store, rawPath) {
        let path = datautil_1.DataUtil.formatPath(rawPath);
        let wrap = this.getStores(store.storeid)[store.userid];
        if (path == '/') {
            wrap.data = null;
        }
        else {
            if (!datautil_1.DataUtil.isObject(wrap.data)) {
                wrap.data = {};
            }
            delete datautil_1.DataUtil.traverseObjectForReference(wrap.data, path)[datautil_1.DataUtil.getNameFromPath(path)];
        }
    }
    getStore(storeid, userid, initialize) {
        if (!(storeid in this.stores) && !initialize) {
            throw new TypeError(`Invalid storeid: ${storeid}-${userid}`);
        }
        let stores = this.getStores(storeid);
        if (!(userid in stores)) {
            stores[userid] = new DataStoreWrap(this, storeid, userid);
        }
        return stores[userid].store;
    }
    serveStore(storeid) {
        this.getStores(storeid);
        return this;
    }
    hasStore(storeid) {
        return (storeid in this.stores);
    }
}
exports.DataStores = DataStores;

},{"./datastore":4,"./datautil":9}],8:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const datastoremanager_1 = require("./datastoremanager");
const userrouter_1 = require("./userrouter");
class DataStoreServer extends datastoremanager_1.DataStoreManager {
    constructor() {
        super();
        this.router = new userrouter_1.UserRouter();
        this.globalStoreIDs = {};
        this.onBindCallbacks = [];
    }
    serveGlobal(storeid, forceUserIDs = []) {
        this.globalStoreIDs[storeid] = forceUserIDs;
        return this.serveByUser(storeid, (socket, storeid, connInfo, callback) => {
            callback('global');
        });
    }
    serveByUser(storeid, userRoute) {
        this.stores.serveStore(storeid);
        this.router.setUserRoute(storeid, userRoute);
        return this;
    }
    userRoute(userRoute) {
        this.router.addGlobalRoute(userRoute);
        return this;
    }
    addSocket(socket) {
        socket.on('datasync_bindrequest', (reqID, storeID, connInfo) => {
            if (!connInfo)
                connInfo = {};
            this.router.route(socket, storeID, connInfo, userID => {
                if (!this.stores.hasStore(storeID)) {
                    return socket.emit('datasync_bindstore', reqID, null);
                }
                let store = this.stores.getStore(storeID, userID, false);
                let bindID = this.binder.getBindID(socket);
                this.binder.bindStore(socket, store, bindID);
                this.onBindCallbacks.forEach(callback => {
                    callback(socket, this.getStore(storeID, userID), connInfo);
                });
                socket.emit('datasync_bindstore', reqID, bindID);
            });
        });
        socket.on('datasync_unbindstore', bindID => {
            this.binder.unbindStore(socket, bindID);
        });
        socket.on('datasync_disconnect', () => {
            this.removeSocket(socket);
        });
    }
    removeSocket(socket) {
        socket.off('datasync_bindrequest');
        socket.off('datasync_unbindstore');
        socket.off('datasync_disconnect');
        this.binder.unbindAll(socket);
    }
    onBind(callback) {
        this.onBindCallbacks.push(callback);
    }
    getStore(storeID, userID = 'global') {
        if (storeID in this.globalStoreIDs && this.globalStoreIDs[storeID].indexOf(userID) == -1) {
            userID = 'global';
        }
        return this.stores.getStore(storeID, userID, false);
    }
}
exports.DataStoreServer = DataStoreServer;

},{"./datastoremanager":6,"./userrouter":11}],9:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class DataUtil {
    /**
     * Check if something is an object {}
     * @param obj The object in question
     * @returns True if an object, otherwise false
     */
    static isObject(obj) {
        return Object.prototype.toString.call(obj) == '[object Object]';
    }
    /**
     * Returns the name eg: /hello/there => there
     * @param path The path to get the name from
     * @returns The name from the path
     */
    static getNameFromPath(path) {
        let spl = DataUtil.formatPath(path).split('/');
        return spl[spl.length - 1];
    }
    /**
     * Will force the input parameter into an array if it is not an array
     *
     * @param obj The object to be forced into an array
     * @returns obj if it was originally an array, or [obj] otherwise
     */
    static forceArray(obj) {
        if (!Array.isArray(obj)) {
            return [obj];
        }
        else {
            return obj;
        }
    }
    /**
     * Will format the provided string into the correct DataSync path format
     *
     * @param path The input path
     * @returns A correctly formatted path
     */
    static formatPath(path) {
        if (!path.startsWith('/')) {
            path = '/' + path;
        }
        if (path.endsWith('/')) {
            path = path.substring(0, path.length - 1);
        }
        if (path == '') {
            path = '/';
        }
        return path;
    }
    /**
     * Will return the value referenced by rawPath
     *
     * @param obj The object to enter
     * @param rawPath The path to the value we are looking for
     *
     * @returns The value referenced by rawPath, or null if it does not exist
     */
    static traverseObject(obj, rawPath) {
        let path = DataUtil.formatPath(rawPath);
        let spl = path.length > 1 ? path.split('/').slice(1) : [];
        return DataUtil.traverseObjectWithArray(obj, spl);
    }
    /**
     * Helper method for traverseObject
     *
     * @param obj The object we are entering
     * @param pathArray An array of each component of the path
     *
     * @returns The value referenced by the pathArray, or null if it does not exist
     */
    static traverseObjectWithArray(obj, pathArray) {
        if (pathArray.length == 0) {
            if (obj == null) {
                return null;
            }
            else {
                return obj;
            }
        }
        if (!DataUtil.isObject(obj)) {
            return null;
        }
        let curNode = pathArray[0];
        if (curNode in obj) {
            return DataUtil.traverseObjectWithArray(obj[curNode], pathArray.slice(1));
        }
        return null;
    }
    /**
     * Will return a memory reference to rawPath in obj
     * Will also initialize values that don't exist an override values that are non-objects
     *
     * @param obj The object to traverse
     * @param rawPath The path to the value we want a memory reference to
     *
     * @returns A memory reference to rawPath in obj, or null if invalid path
     */
    static traverseObjectForReference(obj, rawPath) {
        let path = DataUtil.formatPath(rawPath);
        let spl = path.length > 1 ? path.split('/').slice(1) : [];
        return DataUtil.traverseObjectForReferenceWithArray(obj, spl);
    }
    /**
     * Helper method for traverseObjectForReference
     *
     * @param obj The object we are entering
     * @param pathArray The components of the path
     *
     * @returns A memory reference to pathArray in obj, or null if invalid pathArray
     */
    static traverseObjectForReferenceWithArray(obj, pathArray) {
        if (pathArray.length == 0 || !DataUtil.isObject(obj)) {
            return null;
        }
        if (pathArray.length == 1) {
            return obj;
        }
        let curNode = pathArray[0];
        if (!(curNode in obj) || !DataUtil.isObject(obj[curNode])) {
            obj[curNode] = {};
        }
        return DataUtil.traverseObjectForReferenceWithArray(obj[curNode], pathArray.slice(1));
    }
    static randomString(len) {
        let alpha = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let str = '';
        for (let i = 0; i < len; i++) {
            str += alpha.charAt(Math.floor(Math.random() * alpha.length));
        }
        return str;
    }
    static clone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }
}
exports.DataUtil = DataUtil;

},{}],10:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class StoreUpdater {
    constructor() {
        this.updateCallbacks = [];
    }
    updateStore(socket, store, path, value, failCallback, remove = false) {
        let valid = true;
        this.updateCallbacks.forEach(callback => {
            if (!callback(socket, store, path, value)) {
                valid = false;
            }
        });
        if (!valid) {
            failCallback();
        }
        else {
            if (remove) {
                store.remove(path, [socket.id]);
            }
            else {
                store.update(path, value, [socket.id]);
            }
        }
    }
    /**
     * A method to add a listener to whenever a data store is updated
     * that will return true if a valid update, false otherwise
     * @param callback The callback
     */
    subscribeOnUpdate(callback) {
        this.updateCallbacks.push(callback);
    }
}
exports.StoreUpdater = StoreUpdater;

},{}],11:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class UserRouter {
    constructor() {
        this.userRoutes = {};
        this.globalRoutes = [];
    }
    addGlobalRoute(userRoute) {
        this.globalRoutes.push(userRoute);
    }
    removeGlobalRoute(userRoute) {
        let idx = this.globalRoutes.indexOf(userRoute);
        if (idx >= 0) {
            this.globalRoutes.splice(idx, 1);
        }
    }
    setUserRoute(storeid, userRoute) {
        this.userRoutes[storeid] = userRoute;
    }
    route(socket, storeID, connInfo, callback) {
        let proms = [];
        this.globalRoutes.forEach(route => {
            proms.push(new Promise(resolve => {
                route(socket, storeID, connInfo, userid => {
                    resolve(userid);
                });
            }));
        });
        Promise.all(proms).then(values => {
            for (let i = 0; i < values.length; i++) {
                if (values[i]) {
                    return callback(values[i]);
                }
            }
            if (this.userRoutes[storeID]) {
                this.userRoutes[storeID](socket, storeID, connInfo, userid => {
                    if (userid) {
                        return callback(userid);
                    }
                    else {
                        return callback(socket.id);
                    }
                });
            }
            else {
                return callback(socket.id);
            }
        });
    }
}
exports.UserRouter = UserRouter;

},{}],12:[function(require,module,exports){
'use strict';

var assign        = require('es5-ext/object/assign')
  , normalizeOpts = require('es5-ext/object/normalize-options')
  , isCallable    = require('es5-ext/object/is-callable')
  , contains      = require('es5-ext/string/#/contains')

  , d;

d = module.exports = function (dscr, value/*, options*/) {
	var c, e, w, options, desc;
	if ((arguments.length < 2) || (typeof dscr !== 'string')) {
		options = value;
		value = dscr;
		dscr = null;
	} else {
		options = arguments[2];
	}
	if (dscr == null) {
		c = w = true;
		e = false;
	} else {
		c = contains.call(dscr, 'c');
		e = contains.call(dscr, 'e');
		w = contains.call(dscr, 'w');
	}

	desc = { value: value, configurable: c, enumerable: e, writable: w };
	return !options ? desc : assign(normalizeOpts(options), desc);
};

d.gs = function (dscr, get, set/*, options*/) {
	var c, e, options, desc;
	if (typeof dscr !== 'string') {
		options = set;
		set = get;
		get = dscr;
		dscr = null;
	} else {
		options = arguments[3];
	}
	if (get == null) {
		get = undefined;
	} else if (!isCallable(get)) {
		options = get;
		get = set = undefined;
	} else if (set == null) {
		set = undefined;
	} else if (!isCallable(set)) {
		options = set;
		set = undefined;
	}
	if (dscr == null) {
		c = true;
		e = false;
	} else {
		c = contains.call(dscr, 'c');
		e = contains.call(dscr, 'e');
	}

	desc = { get: get, set: set, configurable: c, enumerable: e };
	return !options ? desc : assign(normalizeOpts(options), desc);
};

},{"es5-ext/object/assign":16,"es5-ext/object/is-callable":19,"es5-ext/object/normalize-options":24,"es5-ext/string/#/contains":27}],13:[function(require,module,exports){
(function (process){
/**
 * This is the web browser implementation of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = require('./debug');
exports.log = log;
exports.formatArgs = formatArgs;
exports.save = save;
exports.load = load;
exports.useColors = useColors;
exports.storage = 'undefined' != typeof chrome
               && 'undefined' != typeof chrome.storage
                  ? chrome.storage.local
                  : localstorage();

/**
 * Colors.
 */

exports.colors = [
  '#0000CC', '#0000FF', '#0033CC', '#0033FF', '#0066CC', '#0066FF', '#0099CC',
  '#0099FF', '#00CC00', '#00CC33', '#00CC66', '#00CC99', '#00CCCC', '#00CCFF',
  '#3300CC', '#3300FF', '#3333CC', '#3333FF', '#3366CC', '#3366FF', '#3399CC',
  '#3399FF', '#33CC00', '#33CC33', '#33CC66', '#33CC99', '#33CCCC', '#33CCFF',
  '#6600CC', '#6600FF', '#6633CC', '#6633FF', '#66CC00', '#66CC33', '#9900CC',
  '#9900FF', '#9933CC', '#9933FF', '#99CC00', '#99CC33', '#CC0000', '#CC0033',
  '#CC0066', '#CC0099', '#CC00CC', '#CC00FF', '#CC3300', '#CC3333', '#CC3366',
  '#CC3399', '#CC33CC', '#CC33FF', '#CC6600', '#CC6633', '#CC9900', '#CC9933',
  '#CCCC00', '#CCCC33', '#FF0000', '#FF0033', '#FF0066', '#FF0099', '#FF00CC',
  '#FF00FF', '#FF3300', '#FF3333', '#FF3366', '#FF3399', '#FF33CC', '#FF33FF',
  '#FF6600', '#FF6633', '#FF9900', '#FF9933', '#FFCC00', '#FFCC33'
];

/**
 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
 * and the Firebug extension (any Firefox version) are known
 * to support "%c" CSS customizations.
 *
 * TODO: add a `localStorage` variable to explicitly enable/disable colors
 */

function useColors() {
  // NB: In an Electron preload script, document will be defined but not fully
  // initialized. Since we know we're in Chrome, we'll just detect this case
  // explicitly
  if (typeof window !== 'undefined' && window.process && window.process.type === 'renderer') {
    return true;
  }

  // Internet Explorer and Edge do not support colors.
  if (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)) {
    return false;
  }

  // is webkit? http://stackoverflow.com/a/16459606/376773
  // document is undefined in react-native: https://github.com/facebook/react-native/pull/1632
  return (typeof document !== 'undefined' && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance) ||
    // is firebug? http://stackoverflow.com/a/398120/376773
    (typeof window !== 'undefined' && window.console && (window.console.firebug || (window.console.exception && window.console.table))) ||
    // is firefox >= v31?
    // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
    (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31) ||
    // double check webkit in userAgent just in case we are in a worker
    (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/));
}

/**
 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
 */

exports.formatters.j = function(v) {
  try {
    return JSON.stringify(v);
  } catch (err) {
    return '[UnexpectedJSONParseError]: ' + err.message;
  }
};


/**
 * Colorize log arguments if enabled.
 *
 * @api public
 */

function formatArgs(args) {
  var useColors = this.useColors;

  args[0] = (useColors ? '%c' : '')
    + this.namespace
    + (useColors ? ' %c' : ' ')
    + args[0]
    + (useColors ? '%c ' : ' ')
    + '+' + exports.humanize(this.diff);

  if (!useColors) return;

  var c = 'color: ' + this.color;
  args.splice(1, 0, c, 'color: inherit')

  // the final "%c" is somewhat tricky, because there could be other
  // arguments passed either before or after the %c, so we need to
  // figure out the correct index to insert the CSS into
  var index = 0;
  var lastC = 0;
  args[0].replace(/%[a-zA-Z%]/g, function(match) {
    if ('%%' === match) return;
    index++;
    if ('%c' === match) {
      // we only are interested in the *last* %c
      // (the user may have provided their own)
      lastC = index;
    }
  });

  args.splice(lastC, 0, c);
}

/**
 * Invokes `console.log()` when available.
 * No-op when `console.log` is not a "function".
 *
 * @api public
 */

function log() {
  // this hackery is required for IE8/9, where
  // the `console.log` function doesn't have 'apply'
  return 'object' === typeof console
    && console.log
    && Function.prototype.apply.call(console.log, console, arguments);
}

/**
 * Save `namespaces`.
 *
 * @param {String} namespaces
 * @api private
 */

function save(namespaces) {
  try {
    if (null == namespaces) {
      exports.storage.removeItem('debug');
    } else {
      exports.storage.debug = namespaces;
    }
  } catch(e) {}
}

/**
 * Load `namespaces`.
 *
 * @return {String} returns the previously persisted debug modes
 * @api private
 */

function load() {
  var r;
  try {
    r = exports.storage.debug;
  } catch(e) {}

  // If debug isn't set in LS, and we're in Electron, try to load $DEBUG
  if (!r && typeof process !== 'undefined' && 'env' in process) {
    r = process.env.DEBUG;
  }

  return r;
}

/**
 * Enable namespaces listed in `localStorage.debug` initially.
 */

exports.enable(load());

/**
 * Localstorage attempts to return the localstorage.
 *
 * This is necessary because safari throws
 * when a user disables cookies/localstorage
 * and you attempt to access it.
 *
 * @return {LocalStorage}
 * @api private
 */

function localstorage() {
  try {
    return window.localStorage;
  } catch (e) {}
}

}).call(this,require('_process'))
},{"./debug":14,"_process":32}],14:[function(require,module,exports){

/**
 * This is the common logic for both the Node.js and web browser
 * implementations of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = createDebug.debug = createDebug['default'] = createDebug;
exports.coerce = coerce;
exports.disable = disable;
exports.enable = enable;
exports.enabled = enabled;
exports.humanize = require('ms');

/**
 * Active `debug` instances.
 */
exports.instances = [];

/**
 * The currently active debug mode names, and names to skip.
 */

exports.names = [];
exports.skips = [];

/**
 * Map of special "%n" handling functions, for the debug "format" argument.
 *
 * Valid key names are a single, lower or upper-case letter, i.e. "n" and "N".
 */

exports.formatters = {};

/**
 * Select a color.
 * @param {String} namespace
 * @return {Number}
 * @api private
 */

function selectColor(namespace) {
  var hash = 0, i;

  for (i in namespace) {
    hash  = ((hash << 5) - hash) + namespace.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }

  return exports.colors[Math.abs(hash) % exports.colors.length];
}

/**
 * Create a debugger with the given `namespace`.
 *
 * @param {String} namespace
 * @return {Function}
 * @api public
 */

function createDebug(namespace) {

  var prevTime;

  function debug() {
    // disabled?
    if (!debug.enabled) return;

    var self = debug;

    // set `diff` timestamp
    var curr = +new Date();
    var ms = curr - (prevTime || curr);
    self.diff = ms;
    self.prev = prevTime;
    self.curr = curr;
    prevTime = curr;

    // turn the `arguments` into a proper Array
    var args = new Array(arguments.length);
    for (var i = 0; i < args.length; i++) {
      args[i] = arguments[i];
    }

    args[0] = exports.coerce(args[0]);

    if ('string' !== typeof args[0]) {
      // anything else let's inspect with %O
      args.unshift('%O');
    }

    // apply any `formatters` transformations
    var index = 0;
    args[0] = args[0].replace(/%([a-zA-Z%])/g, function(match, format) {
      // if we encounter an escaped % then don't increase the array index
      if (match === '%%') return match;
      index++;
      var formatter = exports.formatters[format];
      if ('function' === typeof formatter) {
        var val = args[index];
        match = formatter.call(self, val);

        // now we need to remove `args[index]` since it's inlined in the `format`
        args.splice(index, 1);
        index--;
      }
      return match;
    });

    // apply env-specific formatting (colors, etc.)
    exports.formatArgs.call(self, args);

    var logFn = debug.log || exports.log || console.log.bind(console);
    logFn.apply(self, args);
  }

  debug.namespace = namespace;
  debug.enabled = exports.enabled(namespace);
  debug.useColors = exports.useColors();
  debug.color = selectColor(namespace);
  debug.destroy = destroy;

  // env-specific initialization logic for debug instances
  if ('function' === typeof exports.init) {
    exports.init(debug);
  }

  exports.instances.push(debug);

  return debug;
}

function destroy () {
  var index = exports.instances.indexOf(this);
  if (index !== -1) {
    exports.instances.splice(index, 1);
    return true;
  } else {
    return false;
  }
}

/**
 * Enables a debug mode by namespaces. This can include modes
 * separated by a colon and wildcards.
 *
 * @param {String} namespaces
 * @api public
 */

function enable(namespaces) {
  exports.save(namespaces);

  exports.names = [];
  exports.skips = [];

  var i;
  var split = (typeof namespaces === 'string' ? namespaces : '').split(/[\s,]+/);
  var len = split.length;

  for (i = 0; i < len; i++) {
    if (!split[i]) continue; // ignore empty strings
    namespaces = split[i].replace(/\*/g, '.*?');
    if (namespaces[0] === '-') {
      exports.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));
    } else {
      exports.names.push(new RegExp('^' + namespaces + '$'));
    }
  }

  for (i = 0; i < exports.instances.length; i++) {
    var instance = exports.instances[i];
    instance.enabled = exports.enabled(instance.namespace);
  }
}

/**
 * Disable debug output.
 *
 * @api public
 */

function disable() {
  exports.enable('');
}

/**
 * Returns true if the given mode name is enabled, false otherwise.
 *
 * @param {String} name
 * @return {Boolean}
 * @api public
 */

function enabled(name) {
  if (name[name.length - 1] === '*') {
    return true;
  }
  var i, len;
  for (i = 0, len = exports.skips.length; i < len; i++) {
    if (exports.skips[i].test(name)) {
      return false;
    }
  }
  for (i = 0, len = exports.names.length; i < len; i++) {
    if (exports.names[i].test(name)) {
      return true;
    }
  }
  return false;
}

/**
 * Coerce `val`.
 *
 * @param {Mixed} val
 * @return {Mixed}
 * @api private
 */

function coerce(val) {
  if (val instanceof Error) return val.stack || val.message;
  return val;
}

},{"ms":31}],15:[function(require,module,exports){
"use strict";

// eslint-disable-next-line no-empty-function
module.exports = function () {};

},{}],16:[function(require,module,exports){
"use strict";

module.exports = require("./is-implemented")()
	? Object.assign
	: require("./shim");

},{"./is-implemented":17,"./shim":18}],17:[function(require,module,exports){
"use strict";

module.exports = function () {
	var assign = Object.assign, obj;
	if (typeof assign !== "function") return false;
	obj = { foo: "raz" };
	assign(obj, { bar: "dwa" }, { trzy: "trzy" });
	return (obj.foo + obj.bar + obj.trzy) === "razdwatrzy";
};

},{}],18:[function(require,module,exports){
"use strict";

var keys  = require("../keys")
  , value = require("../valid-value")
  , max   = Math.max;

module.exports = function (dest, src /*, …srcn*/) {
	var error, i, length = max(arguments.length, 2), assign;
	dest = Object(value(dest));
	assign = function (key) {
		try {
			dest[key] = src[key];
		} catch (e) {
			if (!error) error = e;
		}
	};
	for (i = 1; i < length; ++i) {
		src = arguments[i];
		keys(src).forEach(assign);
	}
	if (error !== undefined) throw error;
	return dest;
};

},{"../keys":21,"../valid-value":26}],19:[function(require,module,exports){
// Deprecated

"use strict";

module.exports = function (obj) {
 return typeof obj === "function";
};

},{}],20:[function(require,module,exports){
"use strict";

var _undefined = require("../function/noop")(); // Support ES3 engines

module.exports = function (val) {
 return (val !== _undefined) && (val !== null);
};

},{"../function/noop":15}],21:[function(require,module,exports){
"use strict";

module.exports = require("./is-implemented")()
	? Object.keys
	: require("./shim");

},{"./is-implemented":22,"./shim":23}],22:[function(require,module,exports){
"use strict";

module.exports = function () {
	try {
		Object.keys("primitive");
		return true;
	} catch (e) {
 return false;
}
};

},{}],23:[function(require,module,exports){
"use strict";

var isValue = require("../is-value");

var keys = Object.keys;

module.exports = function (object) {
	return keys(isValue(object) ? Object(object) : object);
};

},{"../is-value":20}],24:[function(require,module,exports){
"use strict";

var isValue = require("./is-value");

var forEach = Array.prototype.forEach, create = Object.create;

var process = function (src, obj) {
	var key;
	for (key in src) obj[key] = src[key];
};

// eslint-disable-next-line no-unused-vars
module.exports = function (opts1 /*, …options*/) {
	var result = create(null);
	forEach.call(arguments, function (options) {
		if (!isValue(options)) return;
		process(Object(options), result);
	});
	return result;
};

},{"./is-value":20}],25:[function(require,module,exports){
"use strict";

module.exports = function (fn) {
	if (typeof fn !== "function") throw new TypeError(fn + " is not a function");
	return fn;
};

},{}],26:[function(require,module,exports){
"use strict";

var isValue = require("./is-value");

module.exports = function (value) {
	if (!isValue(value)) throw new TypeError("Cannot use null or undefined");
	return value;
};

},{"./is-value":20}],27:[function(require,module,exports){
"use strict";

module.exports = require("./is-implemented")()
	? String.prototype.contains
	: require("./shim");

},{"./is-implemented":28,"./shim":29}],28:[function(require,module,exports){
"use strict";

var str = "razdwatrzy";

module.exports = function () {
	if (typeof str.contains !== "function") return false;
	return (str.contains("dwa") === true) && (str.contains("foo") === false);
};

},{}],29:[function(require,module,exports){
"use strict";

var indexOf = String.prototype.indexOf;

module.exports = function (searchString/*, position*/) {
	return indexOf.call(this, searchString, arguments[1]) > -1;
};

},{}],30:[function(require,module,exports){
'use strict';

var d        = require('d')
  , callable = require('es5-ext/object/valid-callable')

  , apply = Function.prototype.apply, call = Function.prototype.call
  , create = Object.create, defineProperty = Object.defineProperty
  , defineProperties = Object.defineProperties
  , hasOwnProperty = Object.prototype.hasOwnProperty
  , descriptor = { configurable: true, enumerable: false, writable: true }

  , on, once, off, emit, methods, descriptors, base;

on = function (type, listener) {
	var data;

	callable(listener);

	if (!hasOwnProperty.call(this, '__ee__')) {
		data = descriptor.value = create(null);
		defineProperty(this, '__ee__', descriptor);
		descriptor.value = null;
	} else {
		data = this.__ee__;
	}
	if (!data[type]) data[type] = listener;
	else if (typeof data[type] === 'object') data[type].push(listener);
	else data[type] = [data[type], listener];

	return this;
};

once = function (type, listener) {
	var once, self;

	callable(listener);
	self = this;
	on.call(this, type, once = function () {
		off.call(self, type, once);
		apply.call(listener, this, arguments);
	});

	once.__eeOnceListener__ = listener;
	return this;
};

off = function (type, listener) {
	var data, listeners, candidate, i;

	callable(listener);

	if (!hasOwnProperty.call(this, '__ee__')) return this;
	data = this.__ee__;
	if (!data[type]) return this;
	listeners = data[type];

	if (typeof listeners === 'object') {
		for (i = 0; (candidate = listeners[i]); ++i) {
			if ((candidate === listener) ||
					(candidate.__eeOnceListener__ === listener)) {
				if (listeners.length === 2) data[type] = listeners[i ? 0 : 1];
				else listeners.splice(i, 1);
			}
		}
	} else {
		if ((listeners === listener) ||
				(listeners.__eeOnceListener__ === listener)) {
			delete data[type];
		}
	}

	return this;
};

emit = function (type) {
	var i, l, listener, listeners, args;

	if (!hasOwnProperty.call(this, '__ee__')) return;
	listeners = this.__ee__[type];
	if (!listeners) return;

	if (typeof listeners === 'object') {
		l = arguments.length;
		args = new Array(l - 1);
		for (i = 1; i < l; ++i) args[i - 1] = arguments[i];

		listeners = listeners.slice();
		for (i = 0; (listener = listeners[i]); ++i) {
			apply.call(listener, this, args);
		}
	} else {
		switch (arguments.length) {
		case 1:
			call.call(listeners, this);
			break;
		case 2:
			call.call(listeners, this, arguments[1]);
			break;
		case 3:
			call.call(listeners, this, arguments[1], arguments[2]);
			break;
		default:
			l = arguments.length;
			args = new Array(l - 1);
			for (i = 1; i < l; ++i) {
				args[i - 1] = arguments[i];
			}
			apply.call(listeners, this, args);
		}
	}
};

methods = {
	on: on,
	once: once,
	off: off,
	emit: emit
};

descriptors = {
	on: d(on),
	once: d(once),
	off: d(off),
	emit: d(emit)
};

base = defineProperties({}, descriptors);

module.exports = exports = function (o) {
	return (o == null) ? create(base) : defineProperties(Object(o), descriptors);
};
exports.methods = methods;

},{"d":12,"es5-ext/object/valid-callable":25}],31:[function(require,module,exports){
/**
 * Helpers.
 */

var s = 1000;
var m = s * 60;
var h = m * 60;
var d = h * 24;
var y = d * 365.25;

/**
 * Parse or format the given `val`.
 *
 * Options:
 *
 *  - `long` verbose formatting [false]
 *
 * @param {String|Number} val
 * @param {Object} [options]
 * @throws {Error} throw an error if val is not a non-empty string or a number
 * @return {String|Number}
 * @api public
 */

module.exports = function(val, options) {
  options = options || {};
  var type = typeof val;
  if (type === 'string' && val.length > 0) {
    return parse(val);
  } else if (type === 'number' && isNaN(val) === false) {
    return options.long ? fmtLong(val) : fmtShort(val);
  }
  throw new Error(
    'val is not a non-empty string or a valid number. val=' +
      JSON.stringify(val)
  );
};

/**
 * Parse the given `str` and return milliseconds.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function parse(str) {
  str = String(str);
  if (str.length > 100) {
    return;
  }
  var match = /^((?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|years?|yrs?|y)?$/i.exec(
    str
  );
  if (!match) {
    return;
  }
  var n = parseFloat(match[1]);
  var type = (match[2] || 'ms').toLowerCase();
  switch (type) {
    case 'years':
    case 'year':
    case 'yrs':
    case 'yr':
    case 'y':
      return n * y;
    case 'days':
    case 'day':
    case 'd':
      return n * d;
    case 'hours':
    case 'hour':
    case 'hrs':
    case 'hr':
    case 'h':
      return n * h;
    case 'minutes':
    case 'minute':
    case 'mins':
    case 'min':
    case 'm':
      return n * m;
    case 'seconds':
    case 'second':
    case 'secs':
    case 'sec':
    case 's':
      return n * s;
    case 'milliseconds':
    case 'millisecond':
    case 'msecs':
    case 'msec':
    case 'ms':
      return n;
    default:
      return undefined;
  }
}

/**
 * Short format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtShort(ms) {
  if (ms >= d) {
    return Math.round(ms / d) + 'd';
  }
  if (ms >= h) {
    return Math.round(ms / h) + 'h';
  }
  if (ms >= m) {
    return Math.round(ms / m) + 'm';
  }
  if (ms >= s) {
    return Math.round(ms / s) + 's';
  }
  return ms + 'ms';
}

/**
 * Long format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtLong(ms) {
  return plural(ms, d, 'day') ||
    plural(ms, h, 'hour') ||
    plural(ms, m, 'minute') ||
    plural(ms, s, 'second') ||
    ms + ' ms';
}

/**
 * Pluralization helper.
 */

function plural(ms, n, name) {
  if (ms < n) {
    return;
  }
  if (ms < n * 1.5) {
    return Math.floor(ms / n) + ' ' + name;
  }
  return Math.ceil(ms / n) + ' ' + name + 's';
}

},{}],32:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],"datasync-js":[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
__export(require("./src/dataref"));
__export(require("./src/datasocket"));
__export(require("./src/datastore"));
__export(require("./src/datastoreclient"));
__export(require("./src/datastoremanager"));
__export(require("./src/datastoreserver"));
__export(require("./src/datautil"));

},{"./src/dataref":2,"./src/datasocket":3,"./src/datastore":4,"./src/datastoreclient":5,"./src/datastoremanager":6,"./src/datastoreserver":8,"./src/datautil":9}]},{},[]);
