var Stream = require('stream');
var Buffer = require('buffer').Buffer;

module.exports = function(entry) {
  return new Promise(function(resolve,reject) {
    var chunks = [];
    var bufferStream = Stream.Transform()
      .on('finish',function() {
        resolve(Buffer.concat(chunks));
      })
      .on('error',reject);

    bufferStream._transform = function(d,e,cb) {
      chunks.push(d);
      cb();
    };
    entry.on('error',reject)
      .pipe(bufferStream);
  });
};