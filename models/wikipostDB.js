var model = module.exports;
var calls = require("./callbacks.js");
var r = require('rethinkdb');
var config = require('../config');

var TABLE = config.table;

model.setup = function (io, callback) {
    console.log("Setting up RethinkDB...");

    r.connect(config.database).then(function(conn) {
        // Does the database exist?
        r.dbCreate(config.database.db).run(conn).then(function(result) {
            console.log("Database created...");
        }).error(function(error) {
            console.log("Database already created...");
        }).finally(function() {
            // Does the table exist?
            r.table(TABLE).limit(1).run(conn, function(error, cursor) {
                var promise;
                if (error) {
                    console.log("Creating table...");
                    promise = r.tableCreate(TABLE).run(conn);
                } else {
                    promise = cursor.toArray();
                }

                // The table exists, setup the update listener
                promise.then(function(result) {
                    console.log("Setting up update listener...");

                    r.table(config.users).run(conn).then(function(cursor) {
                        cursor.toArray(function(error, results) {
                            for(var user = 0; user < results.length; user++){
                                var filters = results[user].filters;
                                var userID = results[user].id;
                                for(var i = 0; i < filters.length; i++){
                                    model.listenFilter( userID, filters[i], callback );
                                }
                            }
                        });
                    });

                    r.table(config.users).changes().run(conn).then(function(cursor) {
                        cursor.each(function(error, row) {
                            var filters = row.new_val.filters;
                            var userID = row.new_val.id;
                            for(var i = 0; i < filters.length; i++){
                                console.log("Found filter");
                                model.listenFilter( userID, filters[i], callback );
                            }
                        });
                    });

                    r.table(config.broadcast).changes({squash: 1.0}).run(conn).then(function(cursor) {
                        cursor.each(function(error, row) {
                            if(row.new_val){
                                io.emit(row.new_val.toEmit + row.new_val.id[0], row.new_val.broadData);
                                r.table(config.broadcast).get(row.new_val.id).delete().run(conn);
                            }
                        });
                    });

                }).error(calls.throwError);
            });
        });
    }).error(calls.throwError);
};

model.getPosts = function (callback) {
    r.connect(config.database).then(function(conn) {
    r.table(TABLE).run(conn).then(function(cursor) {
        cursor.toArray(function(error, results) {
            if (error) throw error;
            callback(results);
        });
    }).error(calls.throwError);
}).error(calls.throwError);
};

model.savePost = function (wikipost, callback) {
    r.connect(config.database).then(function(conn) {
    r.table(TABLE).insert(wikipost).run(conn).then(function(results) {
        callback(true, results);
    }).error(function(error) {
        callback(false, error);
    });
    }).error(function(error) {
        callback(false, error);
    });
};

model.deletePost = function (wikipost, callback) {
    r.connect(config.database).then(function(conn) {
        r.table(TABLE).get(wikipost).delete().run(conn).then(function(results) {
           callback(true, results);
        }).error(function(error) {
            callback(false, error);
        });
    }).error(function(error) {
    callback(false, error);
});
};


// TODO
model.addFilter = function (userID, wikipostFilter) {
    r.connect(config.database).then(function(conn) {
        r.table(config.users).get(userID).update(
			function(user){
  				return r.branch(
		            user('filters').contains(
		            	function(filterRecord) {
    				 		return filterRecord('filter').eq(wikipostFilter);
   						}).not(),
		            {'filters': user('filters').append({table: TABLE, filter: wikipostFilter})},
		            null
	  			);
  			}
		 )
        .run(conn).then(calls.printOK).error(calls.throwError);
    }).error(calls.noFun);
};

model.listenFilter = function (userID, wikipostFilter, callback) {
    r.connect(config.database).then(function(conn) {
        r.table(wikipostFilter.table).filter( wikipostFilter.filter ).changes().run(conn).then(function(cursor) {
           cursor.each(function(error, row) {
               callback(false, userID, row);
           });
        }).error(function(error) {
            callback(true, error);
        });
    }).error(function(error) {
        callback(false, error);
    });
};

model.prepareBroadcast = function (_toEmit, _userID, _broadData) {
    r.connect(config.database).then(function(conn) {
        r.table(config.broadcast).insert({ id:[_userID, _broadData.id], toEmit: _toEmit, broadData: _broadData}).run(conn);
    }).error(function(error) {
        callback(false, error);
    });
};

model.getUserByID = function (userID, callback) {
    r.connect(config.database).then(function(conn) {
        r.table(config.users).get(userID).run(conn).then(function(user) {
    		callback(null, user);
        }).error(function(error) {
            callback(error);
        });
    }).error(function(error) {
        callback(error);
    });
};

model.getUserByCredentials = function (username, password, callback) {
    r.connect(config.database).then(function(conn) {
        r.table(config.users).filter(
            r.row('username').eq(username).and(r.row('password').eq(password))
        ).limit(1).run(conn).then(function(cursor) {
    		 cursor.toArray(function(err, results) {
                if(results.length > 0){
                    callback(false, results[0]);
                }
                else{
                    callback(false, null);
                }
            });
        }).error(function(error) {
            callback(error);
        });
    }).error(function(error) {
        callback(error);
    });
};
