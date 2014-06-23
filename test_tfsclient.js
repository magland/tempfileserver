var TFSClient=require('./tfsclient.js').TFSClient;

var TT=new TFSClient();

console.log ('Waiting...');
setTimeout(function() {
	console.log ('Uploading...');
	var path='/home/magland/Downloads/website.zip';
	TT.upload({path:path},function(tmp) {
		if (!tmp.success) {
			console.error('Problem uploading: '+tmp.error);
			return;
		}
		console.log ('Uploaded: '+tmp.checksum);
		setTimeout(function() {
			console.log ('Downloading...');
			TT.download({path:'testing.dat',checksum:tmp.checksum},function(tmp2) {
				if (!tmp2.success) {
					console.error('Problem downloading: '+tmp2.error);
					return;
				}
				console.log ('Downloaded.');
			});
		},500);
	});
},500);

setTimeout(function() {
},3000);