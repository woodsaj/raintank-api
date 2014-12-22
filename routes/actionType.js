var schema = require('raintank-core/schema');

exports.get = function(req, res) {
    var filter = {
        _id: req.params.id,
    };
    // filter out deleted unless the request is by an admin and has a 'deleted=1' query param.
    if (!(req.user.admin && req.query.deleted == '1')) {
        filter.deletedAt = {'$exists': false};
    }
    return schema.actionTypes.model.findOne(filter).exec(function(err, actionType) {
        if (err) return res.json(500, err);
        if (!actionType) return res.json(404, {message: 'actionType not found.'});
        return res.json({actionType: actionType});
    });
}

exports.list = function(req, res){
    var filter = { };
    // filter out deleted unless the request is by an admin and has a 'deleted=1' query param.
    if (!(req.user.admin && req.query.deleted == '1')) {
        filter.deletedAt = {'$exists': false};
    }
    return schema.actionTypes.model.find(filter).exec(function (err, actionTypes) {
        if (!err) {
          return res.json({actionTypes: actionTypes});
        } else {
          return res.json(500, err);
        }
    });
};

exports.create = function(req, res) {
    if (req.body.actionType) {
        var nt = req.body.actionType;
        nt.account = req.user.account._id;

        actionType = new schema.actionTypes.model(nt);
        actionType.save(function(err) {
            if (err) return res.json(500, err);
            return res.json({actionType: actionType});
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
