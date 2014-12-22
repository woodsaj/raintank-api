var schema = require('raintank-core/schema');

exports.get = function(req, res) {
    var filter = {
        _id: req.params.id,
        account: req.user.account._id
    };

    return schema.alarms.model.findOne(filter).exec(function(err, alarm) {
        if (err) return res.json(500, err);
        if (!alarm) return res.json(404, {message: 'Alarm not found.'});
        return res.json({alarm: alarm});
    });
}

exports.list = function(req, res){
    var start, end;
    if ('end' in req.query) {
        end = new Date(parseInt(req.query.end));
        if (end == 'Invalid Date') end = new Date();
    } else {
        end = new Date();
    }

    if ('start' in req.query) {
        start = new Date(parseInt(req.query.start));
        if (start == 'Invalid Date'){
            console.log('start is invalid');
            start = new Date(end - 86400000);
        }
    } else {
        start = new Date(end - 86400000);
    }

    var filter = {
        account: req.user.account._id,
        "$or": [ 
            {
                createdAt: {
                    "$gte": start,
                    "$lte": end
                },
            },
            {
                clearedAt: {
                    "$gte": start,
                    "$lte": end
                }
            }
        ]
    };
    
    var valid_filters = ["target.classType", "target.id", "type"];
    valid_filters.forEach(function(f) {
        if (f in req.query) {
            filter[f] = req.query[f];
        }

    });
    return schema.alarms.model.find(filter).exec(function (err, alarms) {
        if (!err) {
            return res.json({alarms: alarms});
        } else {
            return res.json(500, err);
        }
    });
};