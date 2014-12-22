
/*
 * GET users listing.
 */
var schema = require('raintank-core/schema');
var pass = require('raintank-core/lib/pass');
var config = require('raintank-core/config');
var emailjs = require('emailjs/email');

exports.account = function(req, res) {
    schema.accounts.model.findOne({_id: req.user.account._id}).exec(function(err, account) {
        if (err) return res.json(500, err);
        if (!account) return res.json(404, {error: 'account not found.'});
        return res.json({account: account});
    });
}

var authenticate = function(email, password, next) {
    schema.users.model.findOne({email: email, deletedAt: {'$exists': false}}).lean().populate('roles').populate('account').exec(function(err, user) {
        if (err) return next(err);
        if (!user) return next(new Error('Authentication failed. Unknown User.'));
        pass.validate(password, user.password, function(err, response) {
            if (err) return next(err);
            if (response) {
                return next(undefined, user);
            } else {
                return next(new Error('Authentication failed.'));
            }
        });
    });
};

exports.authenticate = authenticate;

// create an account and a user in the account.
exports.signup = function(req, res) {
    if (req.body.signup) {
        var acct = {
            name: req.body.signup.name,
            company: req.body.signup.company,
            email: req.body.signup.email,
            address: req.body.signup.address,
            phone: req.body.signup.phone
        };
        var account = new schema.accounts.model(acct);
        
        // check that no-one else is using the email.
        schema.users.model.findOne({email: account.email, deletedAt: {'$exists': false}}, function(err, doc) {
            if (err) {
                console.log(err);
                return res.json(500, err);
            }
            if (doc) return res.json(409, {error: 'email already in use.'});
 
            account.save(function(err) {
                if (err) {
                    console.log(err);
                    return res.json(500, err);
                }
                //var password = req.body.signup.password;
                var password = 'tmpPassword'; //block new signups.

                pass.hash(password, function(err, hash) {
                    if (err) {
                        console.log(err);
                        return res.json(500, err);
                    }
                    var u = {
                        email: req.body.signup.email,
                        name: req.body.signup.name,
                        password: hash,
                        account: account._id,
                        roles: [config.defaultRole]
                    };
                    var user = new schema.users.model(u);
                    user.save(function(err) {
                        if (err) {
                            console.log(err);
                            account.remove(function(acctErr) {
                                if (acctErr) return res.json(500, [err, acctErr]);
                                return res.json(500, err);
                            });
                        } else {
                            console.log('user created');
                            var server = emailjs.server.connect(config.emailer);
                            /*server.send({
                                text: JSON.stringify(req.body.signup, null, '\t'),
                                from: config.emailFrom,
                                to: 'anthony@monkey.id.au',
                                subject: "CloudMetrics - New Signup",
                            }, function(err, message) {
                                console.log("TODO: handle error when sending email fails");
                                console.log(err);
                                return res.json("OK");
                            });*/
                            return res.json("OK");
                        }
                    });
                });
            });
        });
    } else {
        return res.json(401, { 'error': 'invalid payload'});
    }
};

exports.logout = function(req, res) {
    req.session.user_id = null;
    req.session.account_id = null;
    return res.redirect('/');
};

exports.login = function(req, res) {
    console.log(req.body);
    if (req.body.email && req.body.password) {
        console.log('trying to authenticate user: ' + req.body.email);
        var username = req.body.email;
        var password = req.body.password;
        authenticate(username, password, function(err, user) {
            console.log(err);
            if (err) {
                return res.render('login', {loginError: err.message});
            }
            req.session.user_id = user._id;
            //TODO(Awoods) cache userObj.
            return res.redirect('/');
        });
    } else {
        console.log(req.body);
        return res.render('login', {loginEerror: "email and password needed."});
    }
};

exports.get = function(req, res) {
    var filter = {
        _id: req.params.id,
        account: req.user.account._id
    };
    if (filter._id == 'self')
        filter._id = req.user._id;

    // filter out deleted unless the request is by an admin and has a 'deleted=1' query param.
    if (!(req.user.admin && req.query.deleted == '1')) {
        filter.deletedAt = {'$exists': false};
    }
    schema.users.model.findOne(filter).lean().exec(function(err, user) {
        if (err) return res.json(500, err);
        if (!user) return res.json(404, {message: 'user not found.'});
        return res.json({user: user});
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
    schema.users.model.find(filter).lean().exec(function (err, users) {
        if (!err) {
          return res.json({users: users});
        } else {
          return res.json(500, err);
        }
    });
};

exports.create = function(req, res) {
    if (req.body.user) {
        var userData = {
            email: req.body.user.email,
            account: req.user.account._id,
            name: req.body.name,
            roles: req.body.roles || [config.defaultRole]
        };
        pass.hash(req.body.user.password, function(err, hash) { 
            if (err) return res.json(500,err);
            userData.password = hash;
            user = new schema.users.model(userData);
            user.save(function(err) {
                if (err) return res.json(500, err);
                return res.json({user: user});
            });
        });
    } else {
        return res.json(400, {error: 'invalid payload'});
    }
};

exports.update = function(req, res) {
    if (req.body.user) {
        var userData = req.body.user;
        var filter = {
            _id: req.params.id,
            account: req.user.account._id
        };
        // filter out deleted unless the request is by an admin and has a 'deleted=1' query param.
        if (!(req.user.admin && req.query.deleted == '1')) {
            filter.deletedAt = {'$exists': false};
        }
        schema.users.model.findOne(filter).exec(function(err, user) {
            if (err) return res.json(500, err);
            if (!user) return res.json(404, {message: 'user not found.'});
            var editable = ["name", "roles", "token"];

            for (var i = 0, len = editable.length; i < len; i++) {
                var attr = editable[i];
                console.log('checking attr %s', attr)
                if (attr in userData && user[attr] != userData[attr]) {
                    console.log("setting attr %s", attr);
                    user[attr] = userData[attr];
                }
            }

            if ('password' in userData && 'currentPassword' in userData) {
                console.log('changing password.')
                pass.validate(userData.currentPassword, user.password, function(err, response) {
                    if (err) return res.json(500, err);
                    if (response) {
                        pass.hash(userData.password, function(err, hash) {
                            if (err) return res.json(500,err);
                            user.password = hash;
                            user.save(function(err) {
                                if (err) return res.json(500, err);
                                return res.json({user: user});
                            });
                        });
                    } else {
                        return res.json(403, 'Incorrect password.');
                    }
                });
                
            } else {
                user.save(function(err) {
                    if (err) return res.json(500, err);
                    return res.json({user: user});
                });
            }
        });
    } else {
        return res.json(400, {error: 'invalid payload'});
    }
};

exports.delete = function(req, res) {
    var filter = {
        _id: req.params.id,
        account: req.user.account._id
    };
    // filter out deleted unless the request is by an admin and has a 'deleted=1' query param.
    if (!(req.user.admin && req.query.deleted == '1')) {
        filter.deletedAt = {'$exists': false};
    }
    schema.users.model.findOne(filter).exec(function(err, user) {
        if (err) res.json(500, err);
        if (!user) return res.json(404, {message: 'user not found.'});
        user.delete(function(err){
            if (err) return res.json(500, err);
            return res.json({'success': true});
        })
    });
}
