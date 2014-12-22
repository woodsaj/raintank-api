var schema = require('raintank-core/schema');
var fs = require('fs');
var config = require('raintank-core/config');

exports.adminGet = function(req, res) {
    var filter = {
        _id: req.params.id,
    };
    return schema.accounts.model.findOne(filter).lean().exec(function(err, account) {
        if (err) return res.json(500, err);
        if (!account) return res.json(404, {message: 'account not found.'});
        return res.json({account: account});
    });
}

exports.config = function(req, res) {
    fs.readFile('views/config.js', function (err, content) {
        console.log(err);
        var backends = {
            graphite: {
                type: 'graphite',
                url: config.siteUrl,
            },
            raintank: {
                type: 'raintankDatasource',
                url: config.siteUrl,
                grafanaDB: true
            },
            influxdb: {
                type: 'influxdb',
                url: "http://192.168.1.131:8086/db/raintank",
                username: 'graphite',
                password: 'graphite',
            },
        };
        if ('metricBackend'  in req.user.account) {
            req.user.account.metricBackend.forEach(function(backend) {
                backends[backend.name] = {
                    type: backend.type,
                    url: backend.url
                }
                backend.basicAuth = 1;
                if (backend.basicAuth) {
                    backends[backend.name]['basicAuth'] = backend.basicAuth;
                }
            });
        }

        var backendStr = JSON.stringify(backends)
        var configData = content.toString().replace('%datasources%', backendStr);
        return res.send(configData);
    });
}

exports.get = function(req, res) {
    var filter = {
        _id: req.user.account._id,
    };
    return schema.accounts.model.findOne(filter).lean().exec(function(err, account) {
        if (err) return res.json(500, err);
        if (!account) return res.json(404, {message: 'account not found.'});
        return res.json({account: account});
    });
}

//admin only.
exports.list = function(req, res){
    var filter = { };
    // filter out deleted unless the request is by an admin and has a 'deleted=1' query param.
    if (!( req.query.deleted == '1')) {
        filter.deletedAt = {'$exists': false};
    }
    return schema.accounts.model.find(filter).exec(function (err, accounts) {
        if (!err) {
          return res.json({accounts: accounts});
        } else {
          return res.json(500, err);
        }
    });
};

exports.update = function(req, res) {
    if (req.user.account._id != req.params.id) {
        return res.json(403, {error: 'permission denied'});
    }
    if (req.body.account) {
        var acct = req.body.account;
        var filter = {
            _id: req.params.id
        };
        schema.accounts.model.findOne(filter).exec(function(err, account) {
            if (err) {
                return res.json(500, err);
            }
            if (! account) {
                return res.json(404, {message: 'Account not found.'});
            }
            var editable = ['company', 'email', 'address', 'metricBackend'];
            editable.forEach(function(item) {
                if (item in acct && acct[item] != account[item]) {
                    account[item] = acct[item];
                }
            });

            account.save(function(err) {
                if (err) {
                    return res.json(500, err);
                }
                return res.json({account: account});
            });
        });
    } else {
        return res.json(400, {error: 'invalid payload'});
    }
}

exports.delete = function(req, res) {
    var filter = {
        _id: req.user.account._id,
        deletedAt: {'$exists': false}
    };

    schema.accounts.model.findOne(filter).exec(function(err, account) {
        if (err) res.json(500, err);
        if (!account) return res.json(404, {message: 'account not found.'});
        account.delete(function(err){
            if (err) return res.json(500, err);
            return res.json({'success': true});
        })
    });
}
