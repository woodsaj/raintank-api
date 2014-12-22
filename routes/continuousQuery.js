var schema = require('raintank-core/schema');
var config = require('raintank-core/config');
var cmUtil = require('raintank-core/lib/cmUtil');
var async = require('async');

exports.get = function(req, res) {
    var filter = {
        _id: req.params.id,
        account: req.user.account._id,
    };
    // filter out deleted unless the request is by an admin and has a 'deleted=1' query param.
    if (!(req.user.admin && req.query.deleted == '1')) {
        filter.deletedAt = {'$exists': false};
    }
    return schema.continuousQuery.model.findOne(filter).exec(function(err, task) {
        if (err) return res.json(500, err);
        if (!task) return res.json(404, {message: 'continuousQuery not found.'});
        return res.json({continuousQuery: task});
    });
}

exports.list = function(req, res){
    var filter = {
        account: req.user.account._id,
    };
    // filter out deleted unless the request is by an admin and has a 'deleted=1' query param.
    if (!(req.user.admin && req.query.deleted == '1')) {
        filter.deletedAt = {'$exists': false};
    }

    var validFilters = ['services', 'name'];
    validFilters.forEach(function(f) {
        if (f in req.query) {
            filter[f] = req.query[f];
        }
    });

    return schema.continuousQuery.model.find(filter).exec(function (err, continuousQueries) {
        if (!err) {
          return res.json({continuousQueries: continuousQueries});
        } else {
          return res.json(500, err);
        }
    });
};

exports.create = function(req, res) {
    if (req.body.continuousQuery) {
        var t = req.body.continuousQuery;
        var continuousQueryTypeFilter = {
            _id: t.continuousQueryType
        }
        schema.continuousQueryTypes.model.findOne(continuousQueryTypeFilter).lean().exec(function(err, queryType) {
            if (err) {
                return res.json(500, err);
            }
            if (!queryType) {
                return res.json(400, new Error("no matching queryType found."));
            }
            t.account = req.user.account._id;
            task = new schema.continuousQuery.model(t);
            task.save(function(err) {
                if (err) return res.json(500, err);
                var steps = [];
                if (queryType.scheduled) {
                    steps.push(function(cb) {
                        task.reschedule(cb)
                    });
                } 
                steps.push(function(cb) {
                    metric = new schema.metrics.model({
                        name: task.destination,
                        account: task.account,
                        interval: task.frequency,
                        units: task.units,
                        target_type: task.target_type,
                        thresholds: task.thresholds,
                        parent: {
                            class: 'continuousQuery',
                            id: task._id,
                        },
                        lastUpdate: new Date()
                    });
                    metric.save(cb);
                });
                async.parallel(steps, function(err, results) {
                    if (err) {
                        console.log(err);
                        return res.json(500, err);
                    }
                    return res.json({continuousQuery: task});
                });
            });
        });
    } else {
        return res.json(400, {error: 'invalid payload'});
    }
}

exports.update = function(req, res) {
    if (req.body.continuousQuery) {
        var continuousQuery = req.body.continuousQuery;
        var filter = {
            _id: req.params.id,
            account: req.user.account._id
        };

        schema.continuousQuery.model.findOne(filter).populate('continuousQueryType').exec(function(err, task) {
            if (err) res.json(500, err);
            if (!task) return res.json(404, {message: 'continuousQuery not found.'});
            console.log(task);
            reschedule = false;
            var syncThresholds = false;
            var editable = ["target", "name", "enabled", "services", "frequency", "units", "target_type"];

            for (var i = 0, len = editable.length; i < len; i++) {
                var attr = editable[i];
                console.log('checking attr %s', attr)
                if (attr in continuousQuery && task[attr] != continuousQuery[attr]) {
                    console.log("setting attr %s", attr);
                    task[attr] = continuousQuery[attr];
                    if (attr == 'frequency') {
                        reschedule = true;
                    }
                }
            }
            if ('settings' in continuousQuery) {
                // validate settings
                console.log("updating settings");
                var definedSettings = cmUtil.arrayToDict(task.continuousQueryType.settings, "name");
                var settings = {};
                continuousQuery.settings.forEach(function(setting) {
                    if (!(setting.name in definedSettings)) {
                        res.json(400, "unknown setting: " + setting.name);
                    }
                    if ('name' in setting && 'value' in setting) {
                        settings[setting.name] = setting.value;
                    }
                });
                task.settings.forEach(function(querySetting) {
                    if (querySetting.name in settings) {
                        querySetting.value = settings[querySetting.name];
                    }
                });
            }
            if ('thresholds' in continuousQuery) {
                ['warnMax', 'warnMin', 'criticalMax', 'criticalMin'].forEach(function(thresh) {
                    if (thresh in continuousQuery.thresholds && continuousQuery.thresholds[thresh] != task.thresholds[thresh]) {
                        task.thresholds[thresh] = continuousQuery.thresholds[thresh];
                        syncThresholds = true;
                    }
                });
            }
            task.save(function(err) {
                if (err) return res.json(500, err);
                //un-populate
                var scheduled = task.continuousQueryType.scheduled;
                task.continuousQueryType = task.continuousQueryType._id;
                var steps = [];

                if (reschedule && scheduled) {
                    steps.push(function(cb) {
                        task.reschedule(cb);
                    });
                }
                steps.push(function(cb) {
                    var metricFilter = {
                        "parent.class": "continuousQuery",
                        "parent.id": task._id
                    }
                    schema.metrics.model.findOne(metricFilter).exec(function(err, metric) {
                        if (err) {
                            console.log(err);
                            return cb(err);
                        }
                        if (metric) {
                            metric.thresholds = task.thresholds;
                            metric.name = task.destination;
                            metric.interval = task.frequency;
                            metric.units = task.units;
                            metric.target_type = task.target_type;
                            metric.save(cb);
                        } else {
                            metric = new schema.metrics.model({
                                name: task.destination,
                                account: task.account,
                                interval: task.frequency,
                                units: task.units,
                                target_type: task.target_type,
                                thresholds: task.thresholds,
                                parent: {
                                    class: 'continuousQuery',
                                    id: task._id,
                                },
                                lastUpdate: new Date()
                            });
                            metric.save(cb);
                        }
                    });
                });
                async.parallel(steps, function(err, results) {
                    if (err) {
                        console.log(err);
                        return res.json(500, err);
                    }
                    return res.json({continuousQuery: task});
                });

            });
        });
    } else {
        return res.json(400, {error: 'invalid payload'});
    }       
}

exports.delete = function(req, res) {
    var filter = {
        _id: req.params.id,
        account: req.user.account._id
    };
    schema.continuousQuery.model.findOne(filter).exec(function(err, task) {
        if (err) res.json(500, err);
        if (!task) return res.json(404, {message: 'task not found.'});
    
        task.delete(function(err){
            if (err) return res.json(500, err);
            return res.json({'success': true});
        })
    });
}
