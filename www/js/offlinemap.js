'use strict';

var OMC_MapboxAcessKey = 'pk.eyJ1Ijoid2FzaGluZ3Rvbm5hdGlvbmFsIiwiYSI6ImNpanZwc3ZzYzBhMW12em0zNzd2eHJwZTIifQ.aKBRF4oQR4Kt4HzrQEQM0w';


window.offlineMaps = {};

window.offlineMaps.eventManager = {
    _events: {},

    on: function (event, action) {
        console.log('event.on: ' + event);
        if (!(event in this._events)) {
            this._events[event] = [];
        }
        this._events[event].push(action);
        return this;
    },

    off: function (event) {
        console.log('event.off: ' + event);
        delete this._events[event];
        return this;
    },

    fire: function (event) {
        console.log('event.fire: ' + event);
        var events = this._events;
        if (event in events) {
            var actions = events[event];
            var args = Array.prototype.slice.call(arguments, 1);
            for (var i = 0, l = actions.length; i < l; i++) {
                var action = actions[i];
                if (action instanceof Function) {
                    action.apply(null, args);
                } else {
                    this.fire.apply(this, [action].concat(args));
                }
            }
        }
        return this;
    }
};


(function (window, emr, undefined) {
    
    var getIndexedDBStorage = function () {
        var indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;

        var IndexedDBImpl = function () {
            var self = this;
            var db = null;
            var request = indexedDB.open('TileStorage');

            request.onsuccess = function() {
                db = this.result;
                emr.fire('storageLoaded', self);
            };

            request.onerror = function (error) {
                console.log(error);
            };

            request.onupgradeneeded = function () {
                var store = this.result.createObjectStore('tile', { keyPath: 'key'});
                store.createIndex('key', 'key', { unique: true });
            };

            this.add = function (key, value) {
                var transaction = db.transaction(['tile'], 'readwrite');
                var objectStore = transaction.objectStore('tile');
                objectStore.put({key: key, value: value});
            };

            this.delete = function (key) {
                var transaction = db.transaction(['tile'], 'readwrite');
                var objectStore = transaction.objectStore('tile');
                objectStore.delete(key);
            };

            this.get = function (key, successCallback, errorCallback) {
                var transaction = db.transaction(['tile'], 'readonly');
                var objectStore = transaction.objectStore('tile');
                var result = objectStore.get(key);
                result.onsuccess = function () {
                    successCallback(this.result ? this.result.value : undefined);
                };
                result.onerror = errorCallback;
            };
        };

        return indexedDB ? new IndexedDBImpl() : null;
    };

    var getWebSqlStorage = function () {
        var openDatabase = window.openDatabase;

        var WebSqlImpl = function () {
            var self = this;
            var db = openDatabase('TileStorage', '1.0', 'Tile Storage', 5 * 1024 * 1024);
            db.transaction(function (tx) {
                tx.executeSql('CREATE TABLE IF NOT EXISTS tile (key TEXT PRIMARY KEY, value TEXT)', [], function () {
                    emr.fire('storageLoaded', self);
                });
            });

            this.add = function (key, value) {
                db.transaction(function (tx) {
                    tx.executeSql('INSERT INTO tile (key, value) VALUES (?, ?)', [key, value]);
					console.log(value);	
                });
            };

            this.delete = function (key) {
                db.transaction(function (tx) {
                    tx.executeSql('DELETE FROM tile WHERE key = ?', [key]);
                });
            };

            this.get = function (key, successCallback, errorCallback) {
                db.transaction(function (tx) {
                    tx.executeSql('SELECT value FROM tile WHERE key = ?', [key], function (tx, result) {
                        successCallback(result.rows.length ? result.rows.item(0).value : undefined);
                    }, errorCallback);
                });
            };
        };

        return openDatabase ? new WebSqlImpl() : null;
    };

    emr.on('storageLoad', function () {
        var storage = getIndexedDBStorage() ||  getWebSqlStorage() || null;
        if (!storage) {
            emr.fire('storageLoaded', null);
        }
    });
})(window, window.offlineMaps.eventManager);

(function (window, emr, L, undefined) {
    var StorageTileLayer = L.TileLayer.extend({
        _imageToDataUri: function (image) {
            var canvas = window.document.createElement('canvas');
            canvas.width = image.naturalWidth || image.width;
            canvas.height = image.naturalHeight || image.height;

            var context = canvas.getContext('2d');
            context.drawImage(image, 0, 0);

            return canvas.toDataURL('image/png');
        },

        _tileOnLoadWithCache: function () {
            var storage = this._layer.options.storage;
            if (storage) {
                storage.add(this._storageKey, this._layer._imageToDataUri(this));
            }
            L.TileLayer.prototype._tileOnLoad.apply(this, arguments);
        },

        _setUpTile: function (tile, key, value, cache) {
            tile._layer = this;
            if (cache) {
                tile._storageKey = key;
                tile.onload = this._tileOnLoadWithCache;
                tile.crossOrigin = 'Anonymous';
            } else {
                tile.onload = this._tileOnLoad;
            }
            tile.onerror = this._tileOnError;
            tile.src = value;
        },

        _loadTile: function (tile, tilePoint) {
            this._adjustTilePoint(tilePoint);
            var key = tilePoint.z + ',' + tilePoint.y + ',' + tilePoint.x;

            var self = this;
            if (this.options.storage) {
                this.options.storage.get(key, function (value) {
                    if (value) {
                        self._setUpTile(tile, key, value, false);
                    } else {
                        self._setUpTile(tile, key, self.getTileUrl(tilePoint), true);
                    }
                }, function () {
                    self._setUpTile(tile, key, self.getTileUrl(tilePoint), true);
                });
            } else {
                self._setUpTile(tile, key, self.getTileUrl(tilePoint), false);
            }
        }
    });

    emr.on('mapLoad', function (storage) {
		var map = L.map('map').setView([40.0006805,-86.1314006], 12 );
        //new StorageTileLayer('https://api.mapbox.com/v4/mapbox.streets/{z}/{x}/{y}.png?access_token='+OMC_MapboxAcessKey, {storage: storage}).addTo(map);
		new StorageTileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {storage: storage}).addTo(map);
		emr.fire('mapLoaded');
    });
})(window, window.offlineMaps.eventManager, L);

(function (emr) {
    setTimeout(function(){  
    	emr.on('storageLoaded', 'mapLoad');
    	emr.fire('storageLoad');
    }, 100);
})(window.offlineMaps.eventManager);