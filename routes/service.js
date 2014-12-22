var schema = require('raintank-core/schema');
var config = require('raintank-core/config');
var cmUtil = require('raintank-core/lib/cmUtil');
var async = require('async');
var util = require('util');
var http = require('http');
var carbon = require('raintank-core/lib/carbon');
var Q = require('q');
var lodash = require('lodash');
var hashCode = require('string-hash');
var producer = require('raintank-core/lib/kafka').producer;

exports.get = function(req, res) {
    var filter = {
        _id: req.params.id,
        account: req.user.account._id,
    };
    // filter out deleted unless the request is by an admin and has a 'deleted=1' query param.
    if (!(req.user.admin && req.query.deleted == '1')) {
        filter.deletedAt = {'$exists': false};
    }
    return schema.services.model.findOne(filter).exec(function(err, service) {
        if (err) return res.json(500, err);
        if (!service) return res.json(404, {message: 'service not found.'});
        return res.json({service: service});
    });
}

exports.list = function(req, res){
    var filter = {
        account: req.user.account._id,
    };
    // filter out deleted unless the request is by an admin and has a 'deleted=1' query param.
    if (!(req.user.admin && req.query.deleted == '1')) {
        filter.deletedAt = {'$exists': false};
    }

    var validFilters = ['service', 'enabled', 'name','serviceType', 'tags'];
    validFilters.forEach(function(f) {
        if (f in req.query) {
            filter[f] = req.query[f];
        }
    });

    return schema.services.model.find(filter).exec(function (err, services) {
        if (!err) {
          return res.json({services: services});
        } else {
          return res.json(500, err);
        }
    });
};

exports.create = function(req, res) {
    if (req.body.service) {
        var svc = req.body.service;
        svc.account = req.user.account._id;
        //check taskType
        var serviceTypeId = svc.serviceType;
        schema.serviceTypes.model.findOne({_id: serviceTypeId}).exec(function(err, serviceType) {
            if (err) return res.json(400, err);
            if (!serviceType) {
                return res.json(404, {error: 'serviceType not found'});
            }
            // validate settings
            var definedSettings = cmUtil.arrayToDict(serviceType.settings, "name");
            var settings = {};
            svc.settings.forEach(function(setting) {
                if (!(setting.name in definedSettings)) {
                    return res.json(400, "unknown setting: " + setting.name);
                }
                settings[setting.name] = setting;
            });
            serviceType.settings.forEach(function(setting) {
                if (!(setting.name in settings)) {
                    svc.settings.push({
                        name: setting.name,
                        value: setting.value
                    });
                }
            });
            service = new schema.services.model(svc);
            service.offset = Math.round(Math.random() * (service.frequency -1));
            service.save(function(err) {
                if (err) return res.json(500, err);
                return res.json({service: service});
            });
        });
    } else {
        return res.json(400, {error: 'invalid payload'});
    }
}

exports.update = function(req, res) {
        if (req.body.service) {
        var svc = req.body.service;
        var filter = {
            _id: req.params.id,
            account: req.user.account._id
        };

        schema.services.model.findOne(filter).populate("serviceType").exec(function(err, service) {
            if (err) return res.json(500, err);
            if (!service) return res.json(404, {message: 'service not found.'});
            var lastState = service.enabled;

            var editable = ["name", "frequency", "enabled","tags", "metrics"];

            for (var i = 0, len = editable.length; i < len; i++) {
                var attr = editable[i];
                console.log('checking attr %s', attr)
                if (attr in svc && svc[attr] != service[attr]) {
                    console.log("setting attr %s", attr);
                    service[attr] = svc[attr];
                    if (attr == 'frequency') {
                        // if the frequency has changed and now the offset is greater then the Freq,
                        // change the offset.
                        if (service.offset >= service.frequency ) {
                            service.offset = service.offset % service.frequency;
                        }   
                    }
                }
            }
            var removedLocations = [];
            if ('locations' in svc && svc.locations != service.locations) {
                var currentLoc = service.locations;
                service.locations = svc.locations;
                //emit a remove event to all locations that have been removed as part of the update.
                currentLoc.forEach(function(loc) {
                    if (service.locations.indexOf(loc) == -1) {
                        removedLocations.push(loc);
                    }
                });
            }

            if ('settings' in svc) {
                // validate settings
                console.log("updating settings");
                var definedSettings = cmUtil.arrayToDict(service.serviceType.settings, "name");
                var settings = {};
                svc.settings.forEach(function(setting) {
                    if (!(setting.name in definedSettings)) {
                        res.json(400, "unknown setting: " + setting.name);
                    }
                    if ('name' in setting && 'value' in setting) {
                        settings[setting.name] = setting.value;
                    }
                });
                service.settings.forEach(function(svcSetting) {
                    if (svcSetting.name in settings) {
                        svcSetting.value = settings[svcSetting.name];
                    }
                });
            }

            service.save(function(err) {
                if (err) return res.json(500, err);
                
                var steps = [];

                if (removedLocations.length > 0) {
                    steps.push(function(next) {
                        var message = {
                            action: "remove",
                            service: {_id: service._id, locations: removedLocations}
                        };
                        var partition = hashCode(service._id) % config.kafka.partitions;
                        producer.send([{topic: 'serviceChange', messages: [JSON.stringify(message)], partition: partition}], function(err, data) {
                            if (err) {
                                console.log(err);
                                return next(err);
                            }
                            console.log('serviceChange event pushed to queue.');
                            next();
                        });
                    });
                }

                if (service.enabled != lastState) {
                    if (service.enabled == false) {
                        //service is being enabled.
                        console.log('TODO: clear paused alaram');
                    } else {
                        //service is being disabled
                        console.log('TODO: clear all alarms.');
                    }  
                }
                //un-populate
                service.serviceType = service.serviceType._id;

                if (steps.length > 0) {
                    async.parallel(steps, function(err, results) {
                        if (err) return res.json(500, err);
                        
                        return res.json({service: service});
                    });
                } else {
                    return res.json({service: service});
                }
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
    schema.services.model.findOne(filter).exec(function(err, service) {
        if (err) res.json(500, err);
        if (!service) return res.json(404, {message: 'service not found.'});

        service.delete(function(err){
            if (err) return res.json(500, err);
            return res.json({'success': true});
            console.log('TODO: clear all alarms.');
        });
    });
}
