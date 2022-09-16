var express = require('express');
var app = express();
var server = require('http').createServer(app);
var bodyParser = require('body-parser');
var path = require('path');
var config = {}; try {config=require('./config.json')} catch(err){};
var port = process.env.PORT || config.port || 3000;
const Solarman = require('./solarman.js');
var solarman = new Solarman(config);
if (solarman.config.hostname==undefined) {console.error('\x1b[41m Please provide a configuration! \x1b[0m'); process.exit(0)}
server.listen(port, function () { console.log('\x1b[44m SERVER LISTENING ON PORT '+port+' \x1b[0m'); solarman_init(); });
process.on('SIGINT', function(){ if (config.SIGINT==undefined) {config.SIGINT=true; console.log('SIGINT'); process.exit(0);} });
process.on('SIGTERM', function(){ if (config.SIGTERM==undefined) {config.SIGTERM=true; console.log('SIGTERM'); process.exit(0);} });
function solarman_init() {}

//var crypto = require('crypto');
//const hash = crypto.createHash('sha256').update('my_secret_password').digest('hex');
//console.log(hash);

app.use(bodyParser.json({ strict: true }));
app.use(function (error, req, res, next){next()}); // don't show error-message, if it's not JSON ... just ignore it
app.use(bodyParser.urlencoded({ extended: true }));

app.use('(/solar)?/', express.static(__dirname + '/public'));
app.use('(/solar)?/:f?', function(req,res) {
	//res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
	//console.log('>>> '+req.params.file+' > '+JSON.stringify(req.body));
	switch (req.params.f) {

		case undefined:
		case 'get':
			solarman.get((r)=>{
				if (r) {
					res.end(r);
				} else {res.end('HELLO. THIS IS SOLARMAN.\nTHERE IS NO DATA.')}
			});
			break;

		case 'update':
			solarman.update((r)=>{
				if (r) {
					res.end(r);
				} else {res.end('HELLO. THIS IS SOLARMAN.\nTHERE IS NO DATA.')}
			});
			break;

		//case undefined:
		//	res.sendFile('index.html',{root:path.join(__dirname,'public')});
		//	break;

		default:
			res.sendStatus(404);
			break;

	}
});
