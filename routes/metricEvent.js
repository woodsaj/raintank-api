var schema = require('raintank-core/schema');
var util = require('util')
var async = require('async');

exports.list = function(req, res){
    var start, end;
    if ('end' in req.query) {
        end = new Date(parseInt(req.query.end));
        
        if (end == 'Invalid Date') {
            console.log('end is an invalid timestamp');
            end = new Date();
        } 
    } else {
        end = new Date();
    }

    if ('start' in req.query) {
        start = new Date(parseInt(req.query.start));
        if (start == 'Invalid Date'){
            console.log('start is an invalid timestamp');
            start = new Date(end - 86400000);
        }
    } else {
        start = new Date(end - 86400000);
    }

    var filter = {
        filtered: {
            filter: {
                and: [
                    { 
                        range: {
                            timestamp: {
                                "gte": start.getTime(),
                                "lte": end.getTime()
                            }
                        }
                    },
                    {
                        term: {
                            account: req.user.account._id
                        }
                    }
                ]
            }
        },
    };
    console.log(filter);
    var valid_filters = ["type", "parent.class", "parent.id", "details", "state", "metric"];
    valid_filters.forEach(function(f) {
        var match = {};
        if (f in req.query) {
            if (!('query' in filter.filtered)) {
                filter.filtered.query = {};
            }
            if (!('bool' in filter.filtered.query)) {
                filter.filtered.query.bool = {};
            }
            if (!('must' in filter.filtered.query.bool)) {
                filter.filtered.query.bool.must = [];
            }
            if (util.isArray(req.query[f])) {
                match[f] = req.query[f].join(' ');
                filter.filtered.query.bool.must.push({match: match});
            } else {
                match[f] = req.query[f];
                filter.filtered.query.bool.must.push({match: match});
            }
        }
    });
    return schema.metricEvents.find(filter, 100, function (err, events) {
        if (!err) {
          return res.json({metricEvents: events});
        } else {
          return res.json(500, err);
        }
    });
};

exports.create = function(req, res) {
    var e = [];
    if ('event' in req.body) {
        e = [req.body.event];
    } else if ('events' in req.body) {
        e = req.body.events;
    } else {
        return res.json(400, {error: 'invalid payload'});
    }

    var events = [];
    var steps = [];
    e.forEach(function(event) {
        event.account = ""+req.user.account._id;
        var obj = new schema.metricEvents.model(event);
        steps.push(function(next) {
            obj.save(next);
        });
    });

    async.parallel(steps, function(err, response) {
        if (err) {
            console.log('failed to save events.');
            console.log(err);
            return res.json(500, err);
        }
        return res.json({metricEvents: response});
    });
};