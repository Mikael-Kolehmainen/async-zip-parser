const Stream = require('stream');
const util = require('util');
const Buffer = require('buffer').Buffer;
const strFunction = 'function';

function PullStream() {
  if (!(this instanceof PullStream)) {
    return new PullStream();
  }

  Stream.Duplex.call(this,{decodeStrings:false, objectMode:true});
  this.buffer = Buffer.from('');
  const self = this;
  self.on('finish',function() {
    self.finished = true;
    self.emit('chunk',false);
  });
}

util.inherits(PullStream,Stream.Duplex);

PullStream.prototype._write = function(chunk,e,cb) {
  this.buffer = Buffer.concat([this.buffer,chunk]);
  this.cb = cb;
  this.emit('chunk');
};

PullStream.prototype.stream = function(eof,includeEof) {
  const p = Stream.PassThrough();
  const self = this;
  let done;

  function cb() {
    if (typeof self.cb === strFunction) {
      const callback = self.cb;
      self.cb = undefined;
      return callback();
    }
  }

  function pull() {
    let packet;
    if (self.buffer && self.buffer.length) {
      if (typeof eof === 'number') {
        packet = self.buffer.slice(0,eof);
        self.buffer = self.buffer.slice(eof);
        eof -= packet.length;
        done = !eof;
      } else {
        const match = self.buffer.indexOf(eof);
        if (match !== -1) {
          self.match = match
          if (includeEof) match = match + eof.length;
          packet = self.buffer.slice(0,match);
          self.buffer = self.buffer.slice(match);
          done = true;
        } else {
          var len = self.buffer.length - eof.length;
          if (len <= 0) {
            cb();
          } else {
            packet = self.buffer.slice(0,len);
            self.buffer = self.buffer.slice(len);
          }
        }
      }
      if (packet) p.write(packet,function() {
        if (self.buffer.length === 0 || (eof.length && self.buffer.length <= eof.length)) cb();
      });
    }

    if (!done) {
      if (self.finished) {
        self.removeListener('chunk',pull);
        p.end();
      }
    } else {
      self.removeListener('chunk',pull);
      p.end();
    }
  }

  self.on('chunk',pull);
  pull();
  return p;
};

PullStream.prototype.pull = function(eof,includeEof) {
  if (eof === 0) return Promise.resolve('');

  if (!isNaN(eof) && this.buffer.length > eof) {
    const data = this.buffer.slice(0,eof);
    this.buffer = this.buffer.slice(eof);
    return Promise.resolve(data);
  }

  let buffer = Buffer.from('');
  const self = this;

  const concatStream = Stream.Transform();
  concatStream._transform = function(d,e,cb) {
    buffer = Buffer.concat([buffer,d]);
    cb();
  };

  let rejectHandler, pullStreamRejectHandler;
  return new Promise(function(resolve,reject) {
    rejectHandler = reject;
    pullStreamRejectHandler = function(e) {
      self.__emittedError = e;
      reject(e);
    }
    if (self.finished)
      return reject(new Error('FILE_ENDED'));
    self.once('error',pullStreamRejectHandler);
    self.stream(eof,includeEof)
      .on('error',reject)
      .pipe(concatStream)
      .on('finish',function() {resolve(buffer);})
      .on('error',reject);
  })
  .finally(function() {
    self.removeListener('error',rejectHandler);
    self.removeListener('error',pullStreamRejectHandler);
  });
};

PullStream.prototype._read = function(){};

module.exports = PullStream;