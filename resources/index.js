'use strict';
var schema = require('raintank-core/schema');

module.exports.init = function() {
	var resources = {};
	require('fs').readdirSync(__dirname + '/').forEach(function(file) {
	  if (file.match(/.+\.json$/g) !== null) {
	    var name = file.replace('.json', '');
	    resources[name] = require('./' + file);
	  }
	});

	for (var model in resources) {
		resources[model].forEach(function(def) {
			var obj = new schema[model].model(def);
			var table = model;
			schema[table].model.findOne({_id: obj._id}).exec(function(err, doc) {
				if (err) {
					console.log("failed to lookup %s from %s", obj._id, table);
					console.log(err);
					return;
				}
				if (!doc) {
					obj.save(function(err) {
						if (err) {
			                console.log('failed to add %s definitions to DB.', table)
			                throw err;
			            }
			            console.log('%s definition loaded into the DB.', table);
					});
				} else {
					console.log("%s object %s already in DB.", table, obj._id);
				}
			});
		});
	}
}