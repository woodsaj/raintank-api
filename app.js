'use strict';
/**
 * Module dependencies.
 */
var config = require('./config').config;
var express = require('express');
var schema = require('raintank-core/schema');
var routes = require('./routes');
var path = require('path');
var util = require('util');
var cluster = require('cluster');
var http = require('http');
var producer = require('raintank-queue').Publisher;
producer.init({
    publisherSocketAddr: config.queue.publisherSocketAddr,
    partitions: config.queue.partitions,
});

require('./resources').init();
require('raintank-core/serviceTypes').init();

var app = express();

var apiAuth = function(req, res, next) {
    if (req.header('X-Admin-Token') && req.header('x-Admin-Token') == config.adminToken) {
        var accountId = req.header('X-Account-Id');
        schema.accounts.model.findOne({_id: accountId}).lean().exec(function(err, account) {
            if (err) return res.json(500, err);
            
            var user = {
                admin: true,
                account: account
            }
            req.user = user;
            next();
        });         
    } 
    else if (req.session.user_id) {
        schema.users.model.findOne({_id: req.session.user_id}).lean().populate('roles').populate('account').exec(function(err, user) {
            if (err) return res.json(500, err);
            if (user) {
                console.log('continuing session for ' + req.session.user_id);
                req.user = user
                req.session.account_id = user.account._id;
            }
            next();
        });
    } else {
        // check if there is a X-Auth-Token header.
        if (req.header('X-Auth-Token')) {
            var filter = {
                token: req.header('X-Auth-Token')
            };
            schema.users.model.findOne(filter).lean().populate('roles').populate('account').exec(function(err, user) {
                if (err) return res.json(500, err);
                if (user) {
                    console.log('user authenticated by token');
                    req.user = user;
                }
                next();
            });
        } else if (req.header('Authorization')) {
            var auth = req.header('Authorization').split(' ');
            if (auth[0] == 'Basic') {
                var user_pw = new Buffer(auth[1], 'base64').toString().split(':');
                routes.user.authenticate(user_pw[0], user_pw[1], function(err, user) {
                    if (err) {
                        console.log('authentication failed');
                        console.log(err);
                        return res.json(401, err);
                    }
                    req.user = user;
                    next();
                });
            } else {
                res.json(401, {error: 'unsupported HTTP auth type.'});
            }
        } else {
            next();
        }
    }
};

// all environments
app.set('port', config.port || 4000);
app.use(express.favicon());
app.use(express.logger('short'));
app.use(express.json());
app.use(express.cookieParser('asd9asdJJAS0asdD9299'));
app.use(express.cookieSession());
app.use(apiAuth);
app.use(app.router);
app.use(express.static(config.grafana_path));
app.set('view engine', 'jade');
app.set('views', __dirname + '/views');

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

var rbac = function(target, permission, basicAuth) {
    return function(req, res, next) {
        //res.header('Access-Control-Allow-Origin',req.header('origin'));
        //res.header('Access-Control-Allow-Credentials', 'true');
        if (! req.user) {
            if (basicAuth) {
                res.setHeader('WWW-Authenticate', 'Basic realm="Auth required"');
            }
            return res.json(401, {'error': "request was not authenticated."});
        }
        if (!target) {
            return next();
        }

        //admins can do anything.
        if ('admin' in req.user && req.user.admin) {
            return next();
        }

        // admin required, but the user don't have it.
        if (target == 'admin') {
            return res.json(403, {'error': 'Insufficient access'});
        }

        for (var i = 0, len = req.user.roles.length; i < len; i++) {
            
            if (target in req.user.roles[i].permissions) {
                // permsission is one of 'none', r' or 'rw'.  if the user has 'rw' access, then
                // checking for 'r' should also pass.
                if (req.user.roles[i].permissions[target].indexOf(permission) != -1) {
                    return next();
                }
            } 
        }
        return res.json(403, {'error': 'Insufficient access'});
    };
};

var quota = function(dataObject) {
    return function(req, res, next) {
        // quotas are not enforced on admins.
        if ('admin' in req.user && req.user.admin) {
            return next();
        }

        // check quotas for dataObject before adding.
        if (! dataObject in schema) {
            return res.json(500, {error: 'dataObject definition not found'})
        }

        if (dataObject in req.user.account.quota) {
            var filter = {
                account: req.user.account._id,
                deletedAt: {'$exists': false}
            }
            schema[dataObject].model.count(filter).exec(function(error, count) {
                if (error) return res.json(500, error);
                if (count >= req.user.account.quota[dataObject]) {
                    return res.json(403, {error: util.format('quota exceeded for %s', dataObject)});
                }
                next();
            });
        } else {
            return res.json(403, {error: util.format('no quota defined for %s', dataObject)})
        }
    };
}


/* Web Requests */
app.get('/', routes.index);

/* API methods. epxext JSON, return JSON. */
app.post('/signup', routes.user.signup);
app.post('/login', express.urlencoded(), routes.user.login);
app.get('/logout', routes.user.logout);
//Accounts
app.get('/accounts', rbac('accounts', 'r'), routes.account.get);
app.delete('/accounts', rbac('accounts', 'rw'), routes.account.delete);
app.get('/accounts/:id', rbac('admin, true'), routes.account.adminGet);
app.get('/accounts', rbac('admin, true'), routes.account.list);
app.put('/accounts/:id', rbac('accounts', 'rw'), routes.account.update);
app.get('/config.js', rbac(), routes.account.config);
//Users
app.get('/users', rbac('users','r'), routes.user.list);
app.get('/users/:id', rbac('users','r'), routes.user.get);
app.put('/users/:id', rbac('users','rw'), routes.user.update);
app.delete('/users/:id', rbac('users','rw'), routes.user.delete);
app.post('/users', rbac('users','rw'), quota('users'), routes.user.create);
//Roles
app.get('/roles', rbac('roles', 'r'), routes.role.list);
app.get('/roles/:id', rbac('roles', 'r'), routes.role.get);
app.post('/roles', rbac('roles', 'rw'), quota('roles'), routes.role.create);
app.put('/roles/:id', rbac('roles', 'rw'), routes.role.update);
app.delete('/roles/:id', rbac('roles', 'rw'), routes.role.delete);
//Dashboards
app.get('/dashboards', rbac('dashboards','r'), routes.dashboard.list);
app.get('/dashboards/:id', rbac('dashboards','r'), routes.dashboard.get);
app.post('/dashboards', rbac('dashboards','rw'), quota('dashboards'), routes.dashboard.create);
app.put('/dashboards/:id', rbac('dashboards','rw'), routes.dashboard.update);
app.delete('/dashboards/:id', rbac('dashboards','rw'), routes.dashboard.delete);
//Metrics
app.get('/metrics', rbac('metrics','r'), routes.metric.list);
app.get('/metrics/:id', rbac('metrics','r'), routes.metric.get);
app.post('/metrics', rbac('metrics','rw'), quota('metrics'), routes.metric.create);
app.put('/metrics/:id', rbac('metrics','rw'), routes.metric.update);
app.delete('/metrics/:id', rbac('metrics','rw'), routes.metric.delete);
app.post('/metrics/store', rbac('metrics','rw', true), routes.metric.store);

//serviceTypes
app.get('/serviceTypes', rbac(), routes.serviceType.list);
app.get('/serviceTypes/:id', rbac(), routes.serviceType.get);
//services
app.get('/services', rbac('services','r'), routes.service.list);
app.get('/services/:id', rbac('services','r'), routes.service.get);
app.post('/services', rbac('services','rw'), quota('services'), routes.service.create);
app.put('/services/:id', rbac('services','rw'), routes.service.update);
app.delete('/services/:id', rbac('services','rw'), routes.service.delete);
//services availability summary
//app.get('/services/:id/availability', rbac('serviceResults','r'), routes.service.availability);
//events
app.get('/serviceEvents', rbac('serviceEvents','r'), routes.serviceEvents.list);
app.post('/serviceEvents', rbac('serviceEvents','rw'), routes.serviceEvents.create);
app.get('/metricEvents', rbac('metricEvents','r'), routes.metricEvent.list);
app.post('/metricEvents', rbac('metricEvents','rw'), routes.metricEvent.create);
//Actions
app.get('/actions', rbac('actions','r'), routes.action.list);
app.get('/actions/:id', rbac('actions','r'), routes.action.get);
app.post('/actions', rbac('actions','rw'), quota('actions'), routes.action.create);
app.put('/actions/:id', rbac('actions','rw'), routes.action.update);
app.delete('/actions/:id', rbac('actions','rw'), routes.action.delete);
//ActionTypes
app.get('/actionTypes', rbac(), routes.actionType.list);
app.get('/actionsTypes/:id', rbac(), routes.actionType.get);
app.post('/actionTypes', rbac('admin',true), routes.actionType.create);
//ContinuousQueries
app.get('/continuousQuery', rbac('continuousQuery','r'), routes.continuousQuery.list);
app.get('/continuousQuery/:id', rbac('continuousQuery','r'), routes.continuousQuery.get);
app.post('/continuousQuery', rbac('continuousQuery','rw'), quota('continuousQuery'), routes.continuousQuery.create);
app.put('/continuousQuery/:id', rbac('continuousQuery','rw'), routes.continuousQuery.update);
app.delete('/continuousQuery/:id', rbac('continuousQuery','rw'), routes.continuousQuery.delete);
//ChecksTypes
app.get('/continuousQueryTypes', rbac('continuousQueryTypes','r'), routes.continuousQueryType.list);
app.get('/continuousQueryTypes/:id', rbac('continuousQueryTypes','r'), routes.continuousQueryType.get);
//Locations
app.get('/locations', rbac(), routes.location.list);
app.get('/locations/:id', rbac(), routes.location.get);
app.post('/locations', rbac('admin',true), routes.location.create);
app.delete('/locations/:id', rbac('admin',true), routes.location.delete);

if (cluster.isMaster) {
    // Fork workers.
    for (var i = 0; i < config.numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('exit', function(worker, code, signal) {
        console.log('worker ' + worker.process.pid + ' died');
    });
} else {
    // Workers can share any TCP connection
    // In this case its a HTTP server
    http.createServer(app).listen(app.get('port'),function(){
        console.log('Express server listening on port ' + app.get('port'));
    });
}
