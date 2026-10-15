export function textMetrics(text: string) {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
  return {
    wordCount: Array.from(segmenter.segment(text)).filter(part => part.isWordLike).length,
    characterCount: Array.from(text).length,
    paragraphCount: text.trim() ? text.trim().split(/\r?\n\s*\r?\n/u).length : 0,
  };
}
