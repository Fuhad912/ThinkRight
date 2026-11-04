// Validate a video container, without requiring teachers to choose specific codecs.
// Playback quality and clarity are assessed during the existing class review.
export async function inspectVideo(size: number, read: (start: number, end: number) => Promise<Uint8Array>) {
  if (size < 16) throw new Error('Choose a complete video recording.');
  const bytes = await read(0, Math.min(size - 1, 63));
  const text = (at: number, length: number) => new TextDecoder().decode(bytes.subarray(at, at + length));
  const isoVideo = ['ftyp','moov','mdat','wide','free'].includes(text(4,4)); // MP4, MOV, M4V, 3GP
  const ebml = bytes[0]===0x1a && bytes[1]===0x45 && bytes[2]===0xdf && bytes[3]===0xa3; // WebM/MKV
  const avi = text(0,4)==='RIFF' && text(8,4)==='AVI ';
  const mpeg = bytes[0]===0 && bytes[1]===0 && bytes[2]===1 && [0xba,0xb3].includes(bytes[3]);
  if (!isoVideo && !ebml && !avi && !mpeg) throw new Error('Choose a valid video recording. This file could not be recognized.');
  return {};
}
