export function chunkText(text: string, size = 800, overlap = 120): string[] {
  const clean = text
    .replace(/\u0000/g, '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      // prefer to break at a paragraph or sentence boundary
      const brk = Math.max(clean.lastIndexOf('\n\n', end), clean.lastIndexOf('. ', end));
      if (brk > start + size * 0.5) end = brk + 1;
    }
    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}