var schema = require('raintank-core/schema');

exports.get = function(req, res) {
    var filter = {
        _id: req.params.id,
    };
    return schema.serviceTypes.model.findOne(filter).exec(function(err, serviceType) {
        if (err) return res.json(500, err);
        if (!serviceType) return res.json(404, {message: 'serviceType not found.'});
        return res.json({serviceType: serviceType});
    });
}

exports.list = function(req, res){
    var filter = {};
    return schema.serviceTypes.model.find(filter).exec(function (err, serviceTypes) {
        if (!err) {
          return res.json({serviceTypes: serviceTypes});
        } else {
          return res.json(500, err);
        }
    });
};
