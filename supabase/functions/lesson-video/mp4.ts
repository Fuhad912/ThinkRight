// Read MP4 metadata with bounded range requests. Never download a complete video in an Edge Function.
export async function inspectMP4(size: number, read: (start: number, end: number) => Promise<Uint8Array>) {
  const text = (b: Uint8Array, at: number, n: number) => new TextDecoder().decode(b.subarray(at, at + n));
  const u32 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(at);
  const header = (b: Uint8Array, at: number, end: number) => {
    if (at + 8 > end) throw new Error('Invalid MP4 box');
    let length = u32(b, at), offset = 8;
    if (length === 1) {
      if (at + 16 > end) throw new Error('Invalid MP4 box');
      length = u32(b, at + 8) * 4294967296 + u32(b, at + 12); offset = 16;
    }
    if (!length) length = end - at;
    if (!Number.isSafeInteger(length) || length < offset) throw new Error('Invalid MP4 size');
    return { length, offset, type: text(b, at + 4, 4) };
  };
  let pos = 0, moov: Uint8Array | null = null, ftyp = false;
  for (let boxes = 0; pos < size && boxes < 128; boxes++) {
    const b = await read(pos, Math.min(pos + 15, size - 1));
    const box = header(b, 0, size - pos);
    if (pos + box.length > size) throw new Error('Truncated MP4');
    if (box.type === 'ftyp') ftyp = true;
    if (box.type === 'moov') {
      if (moov) throw new Error('Invalid MP4: repeated metadata');
      if (box.length > 8 * 1024 * 1024) throw new Error('MP4 metadata is too large. Export a standard H.264 MP4.');
      moov = await read(pos, pos + box.length - 1);
    }
    pos += box.length;
  }
  if (pos !== size || !ftyp || !moov) throw new Error('Choose a complete MP4 video');
  let video = false, duration = 0;
  const walk = (b: Uint8Array, start: number, end: number, depth = 0) => {
    if (depth > 8) throw new Error('Invalid MP4 nesting');
    for (let at = start; at < end;) {
      const box = header(b, at, end), data = at + box.offset, stop = at + box.length;
      if (stop > end) throw new Error('Invalid MP4 metadata');
      if (['moov','trak','mdia','minf','stbl'].includes(box.type)) walk(b, data, stop, depth + 1);
      if (box.type === 'mvhd') {
        const version = b[data], timeAt = data + (version === 1 ? 20 : 12);
        if (![0,1].includes(version) || timeAt + (version === 1 ? 12 : 8) > stop) throw new Error('Invalid MP4 duration');
        const scale = u32(b, timeAt);
        const ticks = version === 1 ? u32(b, timeAt + 4) * 4294967296 + u32(b, timeAt + 8) : u32(b, timeAt + 4);
        duration = scale ? ticks / scale : 0;
      }
      if (box.type === 'stsd') {
        if (data + 8 > stop) throw new Error('Invalid MP4 codec');
        const count = u32(b, data + 4); let entry = data + 8;
        if (count < 1 || count > 16) throw new Error('Invalid MP4 tracks');
        for (let i = 0; i < count; i++) {
          const sample = header(b, entry, stop);
          if (entry + sample.length > stop) throw new Error('Invalid MP4 track');
          if (['avc1','avc3'].includes(sample.type)) {
            const configAt = entry + sample.offset + 78;
            let config = false;
            for (let at = configAt; at < entry + sample.length;) {
              const child = header(b, at, entry + sample.length);
              if (at + child.length > entry + sample.length) throw new Error('Invalid MP4 video configuration');
              if (child.type === 'avcC' && child.length >= child.offset + 7 && b[at + child.offset] === 1) config = true;
              at += child.length;
            }
            if (!config) throw new Error('Export MP4 with standard H.264 video.');
            video = true;
          } else if (sample.type === 'mp4a') {
            const audioAt = entry + sample.offset;
            if (audioAt + 28 > entry + sample.length || b[audioAt + 8] !== 0 || b[audioAt + 9] !== 0) throw new Error('Export MP4 with standard AAC audio.');
            let aac = false;
            for (let at = audioAt + 28; at < entry + sample.length;) {
              const child = header(b, at, entry + sample.length);
              if (at + child.length > entry + sample.length) throw new Error('Invalid MP4 audio configuration');
              if (child.type === 'esds') {
                // ISO ES_Descriptor -> DecoderConfigDescriptor. Accept MPEG-4 AAC only.
                const end = at + child.length;
                let p = at + child.offset + 4;
                const descriptor = (tag: number) => {
                  if (p >= end || b[p++] !== tag) throw new Error('Export MP4 with AAC audio.');
                  let n = 0, more = true;
                  for (let i = 0; i < 4 && more; i++) { if (p >= end) throw new Error('Invalid MP4 audio descriptor'); const value = b[p++]; n = n * 128 + (value & 127); more = !!(value & 128); }
                  if (more || p + n > end) throw new Error('Invalid MP4 audio descriptor');
                  return p + n;
                };
                descriptor(3);
                if (p + 3 > end) throw new Error('Invalid MP4 audio descriptor');
                p += 2; const flags = b[p++];
                if (flags & 128) p += 2;
                if (flags & 64) { if (p >= end) throw new Error('Invalid MP4 audio descriptor'); p += 1 + b[p]; }
                if (flags & 32) p += 2;
                descriptor(4); aac = b[p] === 0x40;
              }
              at += child.length;
            }
            if (!aac) throw new Error('Export MP4 with AAC audio.');
          } else throw new Error('Export MP4 with H.264 video and AAC audio.');
          entry += sample.length;
        }
      }
      at = stop;
    }
  };
  walk(moov, 0, moov.length);
  if (!video || !Number.isFinite(duration) || duration <= 0) throw new Error('Export a playable H.264 MP4 video.');
  return { duration_seconds: duration };
}
