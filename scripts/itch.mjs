// Lo zip da caricare su itch.io: dentro c'è solo itch/index.html, che mostra il gioco del sito
// (vedi lì). Il gioco non si copia: resta uno, aggiornato insieme al sito.
//   node scripts/itch.mjs           → gioco vero  (itch/casadolcecasa-itch.zip)
//   node scripts/itch.mjs --prova   → gioco di prova, per provare una pagina di itch in bozza
//                                     (itch/casadolcecasa-itch-prova.zip)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const prova = process.argv.includes('--prova');
const GAME_URL = prova ? 'https://casadolcecasa-prova.web.app/' : 'https://casadolcecasa.web.app/';
const OUT = `${ROOT}itch/casadolcecasa-itch${prova ? '-prova' : ''}.zip`;

// CRC32, quello degli zip
const TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Uno zip senza compressione: per un file così piccolo basta, e non servono pacchetti. */
function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // versione
    local.writeUInt16LE(0x0800, 6); // nomi in UTF-8
    local.writeUInt16LE(0, 8); // senza compressione
    local.writeUInt32LE(0, 10); // ora e data
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

const html = readFileSync(`${ROOT}itch/index.html`, 'utf8').replace('__GAME_URL__', GAME_URL);
writeFileSync(OUT, zip([{ name: 'index.html', data: Buffer.from(html, 'utf8') }]));
console.log(`Zip per itch.io: ${OUT}\nGioco: ${GAME_URL}?da=itch`);
