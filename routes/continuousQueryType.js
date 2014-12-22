var schema = require('raintank-core/schema');

exports.get = function(req, res) {
    var filter = {
        _id: req.params.id,
    };
    return schema.continuousQueryTypes.model.findOne(filter).exec(function(err, continuousQueryType) {
        if (err) return res.json(500, err);
        if (!continuousQueryType) return res.json(404, {message: 'continuousQueryType not found.'});
        return res.json({continuousQueryType: continuousQueryType});
    });
}

exports.list = function(req, res){
    var filter = {};
    // filter out deleted unless the request is by an admin and has a 'deleted=1' query param.
    return schema.continuousQueryTypes.model.find(filter).exec(function (err, continuousQueryTypes) {
        if (!err) {
          return res.json({continuousQueryTypes: continuousQueryTypes});
        } else {
          return res.json(500, err);
        }
    });
};
