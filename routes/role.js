var schema = require('raintank-core/schema');

exports.get = function(req, res) {
    var filter = {
        _id: req.params.id,
        "$or": [{public: true}, {account: req.user.account._id}]
    };
    // filter out deleted unless the request is by an admin and has a 'deleted=1' query param.
    if (!(req.user.admin && req.query.deleted == '1')) {
        filter.deletedAt = {'$exists': false};
    }
    return schema.roles.model.findOne(filter).exec(function(err, role) {
        if (err) return res.json(500, err);
        if (!role) return res.json(404, {message: 'Role not found.'});
        return res.json({role: role});
    });
}

exports.list = function(req, res){
    var filter = {
        "$or": [{public: true}, {account: req.user.account._id}]
    };
    // filter out deleted unless the request is by an admin and has a 'deleted=1' query param.
    if (!(req.user.admin && req.query.deleted == '1')) {
        filter.deletedAt = {'$exists': false};
    }
    return schema.roles.model.find(filter).exec(function (err, roles) {
        if (!err) {
          return res.json({roles: roles});
        } else {
          return res.json(500, err);
        }
    });
};

exports.create = function(req, res) {
    if (req.body.role) {
        var r = req.body.role;
        r.account = req.user.account._id;
        r.public = false;
        if (req.user.admin)
            r.public = true;

        role = new schema.roles.model(r);
        role.save(function(err) {
            if (err) return res.json(500, err);
            return res.json({role: role});
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