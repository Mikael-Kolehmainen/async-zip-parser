const asyncZipParser = require("../asyncZipParser");
const fs = require("fs");

const zip = fs.createReadStream('path/to/archive.zip').pipe(asyncZipParser.ParseZip({forceStream: true}));
for await (const entry of zip) {
  const fileName = entry.path;
  const type = entry.type;
  const size = entry.vars.uncompressedSize;
  if (fileName === "this IS the file I'm looking for") {
    entry.pipe(fs.createWriteStream('output/path'));
  } else {
    entry.autodrain();
  }
}