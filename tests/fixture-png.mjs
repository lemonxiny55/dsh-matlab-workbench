// Synthetic 1×1 PNG for test fixtures; independent of private M0/M1 evidence.
import {deflateSync,crc32} from 'node:zlib';

const chunk=(name,bytes)=>{
  const type=Buffer.from(name,'ascii'),length=Buffer.alloc(4),crc=Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  crc.writeUInt32BE(crc32(Buffer.concat([type,bytes])));
  return Buffer.concat([length,type,bytes,crc]);
};

export function fixturePng() {
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(1,0);
  ihdr.writeUInt32BE(1,4);
  ihdr[8]=8;ihdr[9]=2; // RGB, 8 bits per channel.
  const idat=deflateSync(Buffer.from([0,24,96,168]));
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR',ihdr),chunk('IDAT',idat),chunk('IEND',Buffer.alloc(0))]);
}
