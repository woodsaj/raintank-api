var schema = require('raintank-core/schema');
var producer = require('raintank-core/lib/kafka').producer;
var config = require('../config').config;
var uitl = require('util');
var hashCode = require('string-hash');

exports.get = function(req, res) {
    var filter = {
        _id: req.params.id,
        account: req.user.account._id
    };
    // filter out deleted unless the request is by an admin and has a 'deleted=1' query param.
    if (!(req.user.admin && req.query.deleted == '1')) {
        filter.deletedAt = {'$exists': false};
    }
    schema.metrics.model.findOne(filter).exec(function(err, metric) {
        if (err) return res.json(500, err);
        if (!metric) return res.json(404, {message: 'Metric not found.'});
        return res.json({metric: metric});
    });
}

exports.list = function(req, res){
    var filter = {
        account: req.user.account._id
    };
    // filter out deleted unless the request is by an admin and has a 'deleted=1' query param.
    if (!(req.user.admin && req.query.deleted == '1')) {
        filter.deletedAt = {'$exists': false};
    }

    var validFilters = ['parent.class', 'parent.id', 'name', '_id', 'state'];
    validFilters.forEach(function(f) {
        if (f in req.query) {
            filter[f] = req.query[f];
        }
    });
    schema.metrics.model.find(filter).exec(function (err, metrics) {
        if (!err) {
          return res.json({metrics: metrics});
        } else {
          return res.json(500, err);
        }
    });
};

exports.create = function(req, res) {
    return res.json(501, {error: 'Not yet Implemented'});
}

exports.update = function(req, res) {
    if (!('metric' in req.body)) {
        return res.json(400, {error: 'invalid payload'});
    }
    var m = req.body.metric;
    var filter = {
        account: req.user.account._id,
        _id: req.params.id,
    }
    schema.metrics.model.findOne(filter).exec(function(err, metric) {
        if (err) return res.json(500, err);
        if (!metric) return res.json(404,{message: "metric not found."});
        var editable = [
            "interval",
            "units",
            "target",
            "state",
            "keepAlives"
        ]
        for (var i = 0, len = editable.length; i < len; i++) {
            var attr = editable[i];
            console.log('checking attr %s', attr)
            if (attr in m && m[attr] != metric[attr]) {
                console.log("setting attr %s", attr);
                metric[attr] = m[attr];
                if (attr == 'state') {
                    //TODO: send stateChange event to Kafka.
                    console.log('manually changing the metric state.');
                }
            }
        }
        var thresholds = ['warnMin', 'warnMax', 'criticalMin', 'criticalMax'];
        if ("thresholds" in m) {
            thresholds.forEach(function(thresh) {
                if ((thresh in m.thresholds) && (metric.thresholds[thresh] != m.thresholds[thresh])) {
                    console.log('updating thresholds.%s', thresh);
                    metric.thresholds[thresh] = m.thresholds[thresh];
                }
            });
        }
        if ("parent" in m) {
            ["id", "class"].forEach(function(attr) {
                if ((attr in m.parent) && (metric.parent[attr] != m.parent[attr])) {
                    console.log('updating parent.%s', attr);
                    metric.parent[attr] = m.parent[attr];
                }
            });
        }
            
        metric.save(function(err) {
            if (err) return res.json(500, err);
            res.json({metric: metric});
        });
    });

}

exports.delete = function(req, res) {
    return res.json(501, {error: 'Not yet Implemented'});
}

exports.store = function(req, res) {
    //accept arbitary METRICS from user.
    var source = req.query.source;
    var sourceMap = {
        "collectd": collectd,
    };
    var payload = [];
    if (source in sourceMap) {
        var payload = sourceMap[source](req, res);
    } else {
        return res.json(400, {error: "unsupported source."});
    }
    var messages = {};
    payload.forEach(function(metric) {
        var partition = hashCode(metric.name) % config.kafka.partitions;
        if (!(partition in messages)) {
            messages[partition] = [];
        }
        messages[partition].push(JSON.stringify(metric));
    });
    var kafkaPayload = [];
    for (var id in messages) {
        kafkaPayload.push( {
            topic: "metrics",
            messages: messages[id],
            partition: id
        });
    }

    producer.send(kafkaPayload, function(err, data) {
        if (err) {
            console.log(err);
            return res.json(500, err);
        } else {
            console.log('metrics queued.');
            return res.json({'success': true});
        }
    });
}

function collectd(req, res) {
    var metrics = [];
    var payload = req.body;
    var source = collectd;
    payload.forEach(function(obj) {
        for (var i=0; i< obj.values.length; i++) {
            var parts = ['collectd', obj.host];
            ["plugin", "plugin_instance", "type", "type_instance"].forEach(function(part) {
                if (obj[part]) {
                    parts.push(obj[part]);
                }
            });
            parts.push(obj.dsnames[i]);
            var name = parts.join('.');
            var metric = {
                name: name,
                account: req.user.account._id,
                interval: obj.interval,
                units: null,
                target_type: obj.dstypes[i],
                value: obj.values[i],
                time: obj.time,
                parent: {
                    class: "host",
                    id: obj.host
                }
            }
            metrics.push(metric);
        }
    });
    return metrics
}