
/*
 * GET home page.
 */

exports.index = function(req, res){
  if (! req.user) {
  	return res.render('login');
  }
  res.render('index', { title: 'Raintank' });
};

// Load `*.js` under current directory as properties
//  i.e., `User.js` will become `exports['User']` or `exports.User`
require('fs').readdirSync(__dirname + '/').forEach(function(file) {
  if (file.match(/.+\.js/g) !== null && file !== 'index.js') {
    var name = file.replace('.js', '');
    exports[name] = require('./' + file);
  }
});