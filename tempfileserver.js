var	url = require('url');
var http = require('http');
var wisdmconfig=require('./wisdmconfig').wisdmconfig;	
var fs=require('fs');
var crypto=require('crypto');

try {
	//create the data_path directory if doesn't already exist
	fs.mkdirSync(wisdmconfig.tempfileserver.data_path);
}
catch(err) {
}

http.createServer(function (REQ, RESP) {
	console.log ('REQUEST: '+REQ.url);
	
	var data_path=wisdmconfig.tempfileserver.data_path;
	
	var url_parts = url.parse(REQ.url,true);
	
	if (REQ.method == 'OPTIONS') {
		var headers = {};
		
		//allow cross-domain requests
		
		// IE8 does not allow domains to be specified, just the *
		// headers["Access-Control-Allow-Origin"] = req.headers.origin;
		headers["Access-Control-Allow-Origin"] = "*";
		headers["Access-Control-Allow-Methods"] = "POST, GET, PUT, DELETE, OPTIONS";
		headers["Access-Control-Allow-Credentials"] = false;
		headers["Access-Control-Max-Age"] = '86400'; // 24 hours
		headers["Access-Control-Allow-Headers"] = "X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept";
		RESP.writeHead(200, headers);
		RESP.end();
	}
	else if(REQ.method=='POST') {
		//upload a file!
		
		if (url_parts.pathname=='/upload') {
			
			//get the checksum from the query parameter
			var checksum=url_parts.query.checksum||'';
			if (!is_valid_checksum(checksum)) {
				send_json_response({success:false,error:'Invalid checksum in upload: '+checksum});
				return;
			}
		
			//write to a temporary file (later we'll move it over)
			var temppath=make_random_id(10)+'.tmp';
			
			var destinationFile=fs.createWriteStream(temppath);
			
			//we will compute a checksum to compare with the query parameter
			var computed_checksum=crypto.createHash('sha1');
			
			var fileSize = REQ.headers['content-length'];
			if (fileSize>1000*1000*1000) {
				send_json_response({success:false,error:'File is too large: '+fileSize});
				return;
			}
			
			//keep track of how many bytes we have uploaded
			var uploadedBytes = 0 ;
			
			var done=false;
			
			REQ.on('data',function(d) {
				if (done) return;
				
				//update the computed checksum
				computed_checksum.update(d);
				
				//track the total uploaded bytes
				uploadedBytes += d.length;
				if (uploadedBytes>fileSize) {
					//we have exceed the reported content-length
					send_json_response({success:false,error:'Exceeded file size: '+uploadedBytes+' > '+fileSize});
					remove_file(temppath);
					done=true;
					return;
				}
				
				//write to the file
				destinationFile.write(d);
			});
			
			REQ.on('end',function() {
				if (done) return;
				if (uploadedBytes==fileSize) {
					var checksum0=computed_checksum.digest('hex');
					if (checksum0!=checksum) {
						//the checksums don't match!
						remove_file(temppath);
						send_json_response({success:false,error:'Checksums do not match: '+checksum0+' <> '+checksum});
						done=true;
						return;
					}
					var destpath=data_path+'/'+checksum+'.dat';
					if (file_exists(destpath)) {
						remove_file(temppath);
						send_json_response({success:true,checksum:checksum0});
						done=true;
					}
					else if (!rename_file(temppath,destpath)) {
						remove_file(temppath);
						send_json_response({success:false,error:'Problem renaming file.'});
						done=true;
					}
					else {
						send_json_response({success:true,checksum:checksum0});
						done=true;
					}
				}
				else {
					//unexpected file size
					send_json_response({success:false,error:'ERROR: Unexpected file size: '+uploadedBytes+' <> '+fileSize});
					remove_file(temppath);
					done=true;
				}
			});
		}
		else {
			send_json_response({success:false,error:'Unexpected path for POST'});
		}
	}
	else if(REQ.method=='GET') {
		if (url_parts.pathname=='/check') {
			var checksum=url_parts.query.checksum||'';
			if (!is_valid_checksum(checksum)) {
				send_json_response({success:false,error:'Invalid checksum in check: '+checksum});
				return;
			}
			var resp={success:true,exists:file_exists(data_path+'/'+checksum+'.dat')};
			send_json_response(resp);
		}
		else if (url_parts.pathname.indexOf('/download/')===0) {
			var checksum=url_parts.pathname.slice(('/download/').length);
			var ind1=checksum.indexOf('.dat');
			if (ind1<0) {
				send_json_response({success:false,error:'Unexpected file name'});
				return;
			}
			checksum=checksum.slice(0,ind1);
			if (!is_valid_checksum(checksum)) {
				send_json_response({success:false,error:'Invalid checksum in download: '+checksum});
				return;
			}
			var path=data_path+'/'+checksum+'.dat';
			if (!file_exists(path)) {
				send_json_response({success:false,error:'File does not exist'});
				return;
			}
			RESP.writeHead(200, {"Access-Control-Allow-Origin":"*", "Content-Type":"application/octet-stream"});
			var stream=fs.createReadStream(path);
			stream.on('data',function(d) {
				RESP.write(d);
			});
			stream.on('end',function() {
				RESP.end();
			});
		}
		else {
			send_json_response({success:false,error:'Unrecognized url path.'});
		}
	}
	
	function send_json_response(obj) {
		RESP.writeHead(200, {"Access-Control-Allow-Origin":"*", "Content-Type":"application/json"});
		RESP.end(JSON.stringify(obj));
	}
	
	function is_valid_checksum(checksum) {
		if (checksum.length<20) return false;
		if (checksum.length>50) return false;
		return true;
	}
	function file_exists(path) {
		return fs.existsSync(path);
	}
	function remove_file(path) {
		if (!file_exists(path)) return false;
		try {
			fs.unlinkSync(path);
			return true;
		}
		catch(err) {
			return false;
		}
	}
	function rename_file(path1,path2) {
		if (!file_exists(path1)) return false;
		if (file_exists(path2)) return false;
		try {
			fs.renameSync(path1,path2);
			return true;
		}
		catch(err) {
			return false;
		}
	}
	function make_random_id(numchars) {
		if (!numchars) numchars=10;
		var text = "";
		var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
		for( var i=0; i < numchars; i++ ) text += possible.charAt(Math.floor(Math.random() * possible.length));	
		return text;
	}
	
}).listen(wisdmconfig.tempfileserver.listen_port);
console.log ('Listening on port '+wisdmconfig.tempfileserver.listen_port);

