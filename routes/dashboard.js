var schema = require('raintank-core/schema');

exports.get = function(req, res) {
    var filter = {
        _id: req.params.id,
    };
    // filter out deleted unless the request is by an admin and has a 'deleted=1' query param.
    if (!(req.user.admin && req.query.deleted == '1')) {
        filter.deletedAt = {'$exists': false};
    }

    return schema.dashboards.model.findOne(filter).exec(function(err, dashboard) {
        if (err) return res.json(500, err);
        if (!dashboard) return res.json(404, {message: 'dashboard not found.'});
        return res.json({dashboard: dashboard});
    });
}

exports.list = function(req, res){
    var filter = { };
    // filter out deleted unless the request is by an admin and has a 'deleted=1' query param.
    if (!(req.user.admin && req.query.deleted == '1')) {
        filter.deletedAt = {'$exists': false};
    }

    var validFilters = ['name', 'tags'];
    validFilters.forEach(function(f) {
        if (f in req.query) {
            filter[f] = {"$regex": req.query[f]};
        }
    });

    return schema.dashboards.model.find(filter).exec(function (err, dashboards) {
        if (!err) {
          return res.json({dashboards: dashboards});
        } else {
          return res.json(500, err);
        }
    });
};

exports.create = function(req, res) {
    if (req.body.dashboard) {
        var d = req.body.dashboard;
        d.account = req.user.account._id;

        dashboard = new schema.dashboards.model(d);
        dashboard.save(function(err) {
            if (err) return res.json(500, err);
            return res.json({dashboard: dashboard});
         });
    } else {
        return res.json(400, {error: 'invalid payload'});
    }
}

exports.update = function(req, res) {
    if (req.body.dashboard) {
        var dash = req.body.dashboard;
        var filter = {
            account: req.user.account._id,
            _id: req.params.id
        };
        schema.dashboards.model.findOne(filter).exec(function(err, dashboard) {
            if (err) {
                return res.json(500, err);
            }
            if (! dashboard) {
                return res.json(404, {message: 'Dashboard not found.'});
            }
            var editable = ['name', 'tags', 'dashboard'];
            editable.forEach(function(item) {
                if (item in dash && dash[item] != dashboard[item]) {
                    dashboard[item] = dash[item];
                }
            });

            dashboard.save(function(err) {
                if (err) {
                    return res.json(500, err);
                }
                return res.json({dashboard: dashboard});
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

    schema.dashboards.model.findOne(filter).exec(function(err, dashboard) {
        if (err) res.json(500, err);
        if (!dashboard) return res.json(404, new Error('dashboard not found.'));
        dashboard.delete(function(err){
            if (err) return res.json(500, err);
            return res.json({'success': true});
        })
    });
}
