const util = require('util');
const zlib = require('zlib');
const Stream = require('stream');
const binary = require('binary');
const PullStream = require('./PullStream');
const NoopStream = require('./NoopStream');
const BufferStream = require('./BufferStream');
const Buffer = require('buffer').Buffer;

const endDirectorySignature = Buffer.alloc(4);
endDirectorySignature.writeUInt32LE(0x06054b50, 0);

function ParseZip(opts) {
  if (!(this instanceof ParseZip)) {
    return new ParseZip(opts);
  }
  const self = this;
  self._opts = opts;

  PullStream.call(self, self._opts);
  self.on('finish', function() {
    self.emit('end');
    self.emit('close');
  });
  self._readRecord().catch(function(e) {
    if (!self.__emittedError || self.__emittedError !== e)
      self.emit('error',e);
  });
}

util.inherits(ParseZip, PullStream);

ParseZip.prototype._readRecord = async function () {
  const self = this;
  const data = await self.pull(4);

  if (data.length === 0) {
    return;
  }

  const signature = data.readUInt32LE(0);

  if (signature === 0x04034b50) {
    return self._readFile();
  } else if (signature === 0x02014b50) {
    self.__ended = true;
    return self._readCentralDirectoryFileHeader();
  } else if (self.__ended) {
    await self.pull(endDirectorySignature);
    return self._readEndOfCentralDirectoryRecord();
  }
};

ParseZip.prototype._readFile = async function () {
  const self = this;
  const data = await self.pull(26);

  const vars = binary.parse(data)
    .word16lu('versionsNeededToExtract')
    .word16lu('flags')
    .word16lu('compressionMethod')
    .word16lu('lastModifiedTime')
    .word16lu('lastModifiedDate')
    .word32lu('crc32')
    .word32lu('compressedSize')
    .word32lu('uncompressedSize')
    .word16lu('fileNameLength')
    .word16lu('extraFieldLength')
    .vars;

  if (self.crxHeader) vars.crxHeader = self.crxHeader;

  const fileNameBuffer = await self.pull(vars.fileNameLength);
  const fileName = fileNameBuffer.toString('utf8');
  const entry = Stream.PassThrough();

  entry.autodrain = function() {
    const draining = entry.pipe(NoopStream());
    draining.promise = function() {
      return new Promise(function(resolve, reject) {
        draining.on('finish',resolve);
        draining.on('error',reject);
      });
    };
    return draining;
  };

  entry.buffer = function() {
    return BufferStream(entry);
  };

  entry.path = fileName;
  entry.props = {};
  entry.props.path = fileName;
  entry.props.pathBuffer = fileNameBuffer;
  entry.props.flags = {
    "isUnicode": (vars.flags & 0x800) != 0
  };
  entry.type = (vars.uncompressedSize === 0 && /[\/\\]$/.test(fileName)) ? 'Directory' : 'File';

  await self.pull(vars.extraFieldLength);

  entry.vars = vars;

  self.push(entry);

  const fileSizeKnown = !(vars.flags & 0x08) || vars.compressedSize > 0;
  let eof;
  const inflater = (vars.compressionMethod) ? zlib.createInflateRaw() : Stream.PassThrough();

  if (fileSizeKnown) {
    entry.size = vars.uncompressedSize;
    eof = vars.compressedSize;
  } else {
    eof = Buffer.alloc(4);
    eof.writeUInt32LE(0x08074b50, 0);
  }

  return new Promise(function(resolve, reject) {
    self.stream(eof)
      .pipe(inflater)
      .on('error',function(err) { self.emit('error',err);})
      .pipe(entry)
      .on('finish', function() {
        return fileSizeKnown ?
          self._readRecord().then(resolve).catch(reject) :
          self._processDataDescriptor(entry).then(resolve).catch(reject);
      });
  });
};

ParseZip.prototype._readCentralDirectoryFileHeader = async function () {
  const self = this;
  const data = await self.pull(42);

  const vars = binary.parse(data)
    .word16lu('versionMadeBy')
    .word16lu('versionsNeededToExtract')
    .word16lu('flags')
    .word16lu('compressionMethod')
    .word16lu('lastModifiedTime')
    .word16lu('lastModifiedDate')
    .word32lu('crc32')
    .word32lu('compressedSize')
    .word32lu('uncompressedSize')
    .word16lu('fileNameLength')
    .word16lu('extraFieldLength')
    .word16lu('fileCommentLength')
    .word16lu('diskNumber')
    .word16lu('internalFileAttributes')
    .word32lu('externalFileAttributes')
    .word32lu('offsetToLocalFileHeader')
    .vars;

  return self.pull(vars.fileNameLength).then(function(fileName) {
    vars.fileName = fileName.toString('utf8');
    return self.pull(vars.extraFieldLength);
  })
  .then(function(extraField) {
    return self.pull(vars.fileCommentLength);
  })
  .then(function(fileComment) {
    return self._readRecord();
  });
};

ParseZip.prototype._readEndOfCentralDirectoryRecord = async function() {
  const self = this;
  const data = await self.pull(18);

  const vars = binary.parse(data)
    .word16lu('diskNumber')
    .word16lu('diskStart')
    .word16lu('numberOfRecordsOnDisk')
    .word16lu('numberOfRecords')
    .word32lu('sizeOfCentralDirectory')
    .word32lu('offsetToStartOfCentralDirectory')
    .word16lu('commentLength')
    .vars;

  let comment = await self.pull(vars.commentLength);
  comment = comment.toString('utf8');

  self.end();
  self.push(null);

  return comment;
};

ParseZip.prototype._processDataDescriptor = async function (entry) {
  const self = this;
  const data = await self.pull(16);
  const vars = binary.parse(data)
    .word32lu('dataDescriptorSignature')
    .word32lu('crc32')
    .word32lu('compressedSize')
    .word32lu('uncompressedSize')
    .vars;

  entry.size = vars.uncompressedSize;
  return self._readRecord();
};

module.exports = ParseZip;