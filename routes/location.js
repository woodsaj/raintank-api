var schema = require('raintank-core/schema');

exports.get = function(req, res) {
    var filter = {
        _id: req.params.id,
    };
    // filter out deleted unless the request is by an admin and has a 'deleted=1' query param.
    if (!(req.user.admin && req.query.deleted == '1')) {
        filter.deletedAt = {'$exists': false};
    }

    var projection = {};
    //hide the url of the node.
    if (!(req.user.admin)) {
        projetion = {url: 0};
    }
    
    return schema.locations.model.findOne(filter).select(projection).exec(function(err, location) {
        if (err) return res.json(500, err);
        if (!location) return res.json(404, {message: 'location not found.'});
        return res.json({location: location});
    });
}

exports.list = function(req, res){
    var filter = { };
    // filter out deleted unless the request is by an admin and has a 'deleted=1' query param.
    if (!(req.user.admin && req.query.deleted == '1')) {
        filter.deletedAt = {'$exists': false};
    }
    var projection = {};
    //hide the url of the node.
    if (!(req.user.admin)) {
        projetion = {url: 0};
    }
    return schema.locations.model.find(filter).select(projection).exec(function (err, locations) {
        if (!err) {
          return res.json({locations: locations});
        } else {
          return res.json(500, err);
        }
    });
};

exports.create = function(req, res) {
    if (req.body.location) {
        var l = req.body.location;
        l.account = req.user.account._id;

        location = new schema.locations.model(l);
        location.save(function(err) {
            if (err) return res.json(500, err);
            return res.json({location: location});
         });
    } else {
        return res.json(400, {error: 'invalid payload'});
    }
}

exports.update = function(req, res) {
    return res.json(501, {error: 'Not yet Implemented'});
}

exports.delete = function(req, res) {
    return res.json(501, {error: 'Not yet Implemented'});
}
