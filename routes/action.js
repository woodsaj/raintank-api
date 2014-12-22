var schema = require('raintank-core/schema');
var cmUtil = require('raintank-core/lib/cmUtil');

exports.get = function(req, res) {
    var filter = {
        _id: req.params.id,
        account: req.user.account._id
    };
    // filter out deleted unless the request is by an admin and has a 'deleted=1' query param.
    if (!(req.user.admin && req.query.deleted == '1')) {
        filter.deletedAt = {'$exists': false};
    }
    return schema.actions.model.findOne(filter).exec(function(err, action) {
        if (err) return res.json(500, err);
        if (!action) return res.json(404, {message: 'action not found.'});
        return res.json({action: action});
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
    return schema.actions.model.find(filter).exec(function (err, actions) {
        if (!err) {
          return res.json({actions: actions});
        } else {
          return res.json(500, err);
        }
    });
};

exports.create = function(req, res) {
    if (req.body.action) {
        var n = req.body.action;
        n.account = req.user.account._id;

        action = new schema.actions.model(n);
        action.save(function(err) {
            if (err) return res.json(500, err);
            return res.json({action: action});
         });
    } else {
        return res.json(400, {error: 'invalid payload'});
    }
}

exports.update = function(req, res) {
    if (req.body.action) {
        var a = req.body.action;
        var filter = {
            _id: req.params.id,
            account: req.user.account._id
        };

        schema.actions.model.findOne(filter).populate("actionType").exec(function(err, action) {
            if (err) res.json(500, err);
            if (!action) return res.json(404, {message: 'action not found.'});
            var editable = ["name"];
            editable.forEach(function(attr){ 
                if (attr in a && a[attr] != action[attr]) {
                    console.log("setting attr %s", attr);
                    action[attr] = a[attr];
                }
            });

            if ('settings' in a) {
                // validate settings
                console.log("updating settings");
                var definedSettings = cmUtil.arrayToDict(action.actionType.settings, "name");
                var currentSettings = cmUtil.arrayToDict(action.settings, "name");
                var newSettings = [];
                a.settings.forEach(function(setting) {
                    if (!(setting.name in definedSettings)) {
                        res.json(400, "unknown setting: " + setting.name);
                    }
                    if ('name' in setting && 'value' in setting) {
                        newSettings[setting.name] = setting.value;
                    }
                });
                action.actionType.settings.forEach(function(setting) {
                    if (!(setting.name in currentSettings)) {
                        action.settings.push({
                            name: setting.name,
                            value: setting.value
                        });
                    }
                });
                action.settings.forEach(function(setting) {
                    if (setting.name in newSettings) {
                        setting.value = newSettings[setting.name];
                    }
                });
            }
            action.save(function(err) {
                if (err) return res.json(500, err);
                return res.json({action: action});
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
    schema.actions.model.findOne(filter).exec(function(err, action) {
        if (err) res.json(500, err);
        if (!action) return res.json(404, {message: 'action not found.'});
        return res.json({'success': true});
    });
}
