module.exports = Solarman;
const https = require('https');

/*
  "hostname":                  "api.solarmanpv.com",
  "path_token":                "/account/v1.0/token",
  "path_device_currentData":   "/device/v1.0/currentData",
  "path_device_historical":    "/device/v1.0/historical",
  "path_station_realTime":     "/station/v1.0/realTime",
  "path_weather":              "/region-s/weather/searchForecast?regionNationId=60&regionLevel1=886&regionLevel2=14528&lan=de",

  "email":                    "youremail@yourmaildomain.com",
  "password_SHA256":          "64_byte_hex_string",
  "deviceSn":                 "1234567890-1",
  "stationId":                1234567,
  "appId":                    "123456789012345",
  "appSecret":                "32_byte_hex_string"
*/
//const hash = crypto.createHash('sha256').update(input).digest('hex');

function Solarman(config) {
	this.config=config;
	this.bearer_token=undefined;
	this.bearer_token='eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX25hbWUiOiIwX25ldHp3ZXJnQGdtYWlsLmNvbV8yIiwic2NvcGUiOlsiYWxsIl0sImRldGFpbCI6eyJvcmdhbml6YXRpb25JZCI6MCwidG9wR3JvdXBJZCI6bnVsbCwiZ3JvdXBJZCI6bnVsbCwicm9sZUlkIjotMSwidXNlcklkIjo5MTg3ODgsInZlcnNpb24iOjEsImlkZW50aWZpZXIiOiJuZXR6d2VyZ0BnbWFpbC5jb20iLCJpZGVudGl0eVR5cGUiOjIsImFwcElkIjoiMjAyMjA3Mjc4MDI1MzI4In0sImV4cCI6MTY2Nzc2NjAyMiwiYXV0aG9yaXRpZXMiOlsiYWxsIl0sImp0aSI6IjIzNGI5Njk2LWE4OTQtNGQ5NS1iNTc0LTkwOTQ1NzAzM2E2MCIsImNsaWVudF9pZCI6InRlc3QifQ.l6LKFDaOt41FU1qzx4BJLXKpSal7zJyKBT0BngJA4UJhdOrtyY51rnwtxIcFeDobjs8zkpQlEQpy3COoVgqFFxjpLkvqOeKUrLfEnZigttW0WHa2L2BVlxVuwODdX-y_r4I669DmOidaXDNdOMU496AVYv0E3SgwH9FjL9P5MMg7muUdzaaOtkc9aqn_VGgqx5dmhzwLK3eEVRbzlkD3BqP9I60JfrSSDF1cosryAZXLg4N9cVzkB0_NyxMo8fLTeepZ-4WVoTW4jaVoHNy9vWnx9LiQeSKAYYpkzXQNcFsm-ns4itSA6HULeZJKRUiPVl8jaVW2p1K4AtWB7F8L3w';
	if (!this.bearer_token) {this.update_bearer_token()}
	this.device_currentData=new Object();
	this.device_historical_dayframe=[];
	this.update_device_currentData(()=>{});
	this.update_device_historical_dayframe(()=>{});
	this.update_device_historical_dayframe(()=>{},-86400000);
	return this;
}

Solarman.prototype.update_bearer_token = function () {
	this.bearer_token=undefined;
	this.request(
		'POST',
		this.config.path_token+'?appId='+this.config.appId,
		{'Content-Type':'application/json'},
		JSON.stringify({'appSecret': this.config.appSecret, 'email': this.config.email, 'password': this.config.password_SHA256}),
		(r)=>{
			let o=JSON_parse(r);
			if (o.success==true) {
				this.bearer_token=o.access_token;
				this.device_currentData.message=undefined;
				this.device_currentData.info=undefined;
			} else {
				// if request failed
				this.device_currentData.message='AUTHENTICATION FAILED.';
				this.device_currentData.info=r;
			}
		}
	);
}

Solarman.prototype.get = function (callback) {
	this.device_currentData.age=stopwatch(this.device_currentData.lastupdate);
	callback(JSON.stringify({'current':this.device_currentData,'history':this.device_historical_dayframe}));
}

Solarman.prototype.update = function (callback) {
	this.device_currentData.age=stopwatch(this.device_currentData.lastupdate);
	if (this.device_currentData.age>(this.config.max_age||15000)) {
		let c = new Promise((resolve)=>{this.update_device_currentData((r)=>{resolve(r)})});
		let h = new Promise((resolve)=>{this.update_device_historical_dayframe((r)=>{resolve(r)})});
		Promise.all([c,h]).then((values_of_all_promises_array)=>{this.get(callback)});
	} else {this.get(callback)}
}

Solarman.prototype.update_device_currentData = function (callback) {
	this.request(
		'POST',
		this.config.path_device_currentData+'?appId='+this.config.appId,
		{'Content-Type':'application/json', 'Authorization':'Bearer '+this.bearer_token},
		JSON.stringify({'deviceSn': this.config.deviceSn}),
		(r)=>{
			this.device_currentData=new Object();
			let o=JSON_parse(r);
			if (o.success==true) {
				// parse data
				this.device_currentData.state=o.deviceState;
				this.device_currentData.dc_power=get_value_by_key(o.dataList,'DPi_t1');
				this.device_currentData.production_today=get_value_by_key(o.dataList,'Etdy_ge1');
				this.device_currentData.production_total=get_value_by_key(o.dataList,'Et_ge0');
				this.device_currentData.lastupdate=stopwatch();
			} else {
				// if request failed
				this.device_currentData.message='NO DATA AVAILABLE. TRY AGAIN LATER.';
				this.device_currentData.info=r;
				if (o.msg=='auth invalid token') {this.update_bearer_token()}
			}
			callback();	
		}
	);
}

Solarman.prototype.update_device_historical_dayframe = function (callback,offset) {
	// get data for a given day (default=today)
	// merge received data into device_historical_dayframe-array and delete all data older than 24 hours
	let d=new Date();
	if (offset!==undefined) {d=new Date(d.getTime()+offset)} // offset = -86400000 for yesterday
	let request_day=d.getFullYear()+'-'+(d.getMonth()+1).toString().padStart(2,'0')+'-'+d.getDate().toString().padStart(2,'0');
	this.request(
		'POST',
		this.config.path_device_historical+'?appId='+this.config.appId,
		{'Content-Type':'application/json', 'Authorization':'Bearer '+this.bearer_token},
		JSON.stringify({'timeType': 1, 'startTime': request_day, 'endTime': request_day, 'deviceSn': this.config.deviceSn}),
		(r)=>{
			let o=JSON_parse(r);
			if (o.success==true) {
				if (this.device_historical_dayframe==undefined) {this.device_historical_dayframe=[]}
				// parse data
				o.paramDataList.map((e)=>{
					let d=new Date(e.collectTime*1000);
					return [parseInt(e.collectTime),d.getDate().toString().padStart(2,'0')+'|'+d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0'),parseFloat(get_value_by_key(e.dataList,'DPi_t1'))];
				})
				// Parse data. For each dataset:
				.forEach((e)=>{
					// if we do not find same timestamp in existing data, then save
					if (!this.device_historical_dayframe.some((f)=>{return f[0]==e[0]})) {this.device_historical_dayframe.push(e)}
				})
				// housekeeping: delete datasets older than 24 hours
				let remove_older_than_this=Math.round(Date.now()/1000)-86400;
				this.device_historical_dayframe=this.device_historical_dayframe.filter((e)=>{return e[0]>remove_older_than_this});
				this.device_historical_dayframe.sort(function compareFn(a,b){if (a[0]<b[0]){return -1}; if (a[0]>b[0]){return 1}; if(a[0]==b[0]){return 0}});
			} else {
				// if request failed
			}
			callback();	
		}
	);
}

function JSON_parse(json) {let o=new Object(); try {o=JSON.parse(json)} catch (error) {o.data=json;o.error=error;} return o;} // returns object in any case, empty object if parsing fails
function get_value_by_key(list,key) {if (list&&list.length) {let f=list.find(e=>e.key==key); return f?f.value:undefined;} else {return undefined}}
function stopwatch(startdate) {if (typeof startdate != 'undefined') {return new Date()-startdate} else {return new Date()}}

Solarman.prototype.request = function (method,path,headers,body,callback) {
	let o = new Object();
	o.hostname=this.config.hostname;
	o.port=443;
	o.method=method||'GET';
	o.path=path||'';
	o.headers=headers||undefined;
	//console.log(o);
	let req = https.request(o, res => {
		let r=''; //if (is_binary) {res.setEncoding('binary')};
		res.on('data', d => {r+=d})
		res.on('end', function () {callback(r)}) // console.log(r);
	})
	req.on('error', error => {console.error('==ERROR== ',error)})
	req.write(body);
	req.end();
}
