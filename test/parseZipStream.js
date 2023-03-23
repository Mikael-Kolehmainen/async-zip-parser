const asyncZipParser = require("..");
const fs = require("fs");

const main = async () => {
  const zip = fs.createReadStream('input.zip').pipe(asyncZipParser.ParseZip({forceStream: true}));
  for await (const entry of zip) {
    const fileName = entry.path;
    const type = entry.type;
    const size = entry.vars.uncompressedSize;
    entry.pipe(fs.createWriteStream('output/output.txt'));
  }
}

main();