const asyncZipParser = require("..");
const fs = require("fs");

const main = async () => {
  const zip = fs.createReadStream('input.zip').pipe(asyncZipParser.ParseZip());
  let i = 0;

  for await (const entry of zip) {
    console.log(entry.path);
    if (entry.path === "test.xlsx") {
      const fileName = entry.path;
      const type = entry.type;
      const size = entry.vars.uncompressedSize;
      entry.pipe(fs.createWriteStream(`output/${fileName}`));
    } else {
      entry.autodrain();
    }
    console.log(i);
    i++;
  }
}

main();