import type { OCRPageObject } from "@mistralai/mistralai/models/components";

const DEFAULT_CHUNK_WORD_TARGET = 450;
const DEFAULT_CHUNK_WORD_OVERLAP = 75;
const EMPTY_DOCUMENT_CHUNK_TEXT = "[No extractable text found in this PDF.]";

export type ChunkPageSpan = {
  pageNumber: number;
  startOffset: number;
  endOffset: number;
};

export type DocumentChunk = {
  chunkIndex: number;
  startPageNumber: number;
  endPageNumber: number;
  text: string;
  tokenCount: number;
  pageSpans: ChunkPageSpan[];
};

export type DocumentChunkingOptions = {
  targetWords?: number;
  overlapWords?: number;
};

type ChunkUnit = {
  pageNumber: number;
  text: string;
  kind: "content" | "table";
};

function sanitizeContent(text: string) {
  const sanitized = text
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/^\n+|\n+$/g, "");
  return sanitized.trim().length > 0 ? sanitized : "";
}

function countWords(text: string) {
  return text.match(/\S+/g)?.length ?? 0;
}

function isMarkdownTableDelimiter(line: string) {
  const normalized = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells = normalized.split("|").map((cell) => cell.trim());
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isMarkdownTableStart(lines: string[], index: number) {
  return (
    lines[index]?.includes("|") === true &&
    lines[index + 1] !== undefined &&
    isMarkdownTableDelimiter(lines[index + 1])
  );
}

function getFenceMarker(line: string) {
  return line.match(/^\s{0,3}(`{3,}|~{3,})/)?.[1] ?? null;
}

function splitMarkdownIntoUnits(markdown: string, pageNumber: number) {
  const text = sanitizeContent(markdown);
  if (!text) return [];

  const lines = text.split("\n");
  const units: ChunkUnit[] = [];
  let pendingLines: string[] = [];

  const flushPending = () => {
    const content = sanitizeContent(pendingLines.join("\n"));
    pendingLines = [];
    if (content) {
      units.push({ pageNumber, text: content, kind: "content" });
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const fenceMarker = getFenceMarker(line);

    if (fenceMarker) {
      flushPending();
      const fencedLines = [line];
      const closingFence = new RegExp(
        `^\\s{0,3}${fenceMarker[0]}{${fenceMarker.length},}\\s*$`,
      );

      while (index + 1 < lines.length) {
        index += 1;
        const fencedLine = lines[index] ?? "";
        fencedLines.push(fencedLine);
        if (closingFence.test(fencedLine)) break;
      }

      const content = sanitizeContent(fencedLines.join("\n"));
      if (content) {
        units.push({ pageNumber, text: content, kind: "content" });
      }
      continue;
    }

    if (isMarkdownTableStart(lines, index)) {
      flushPending();
      const tableLines = [line, lines[index + 1] ?? ""];
      index += 1;

      while (
        index + 1 < lines.length &&
        lines[index + 1]?.trim() !== "" &&
        lines[index + 1]?.includes("|") === true
      ) {
        index += 1;
        tableLines.push(lines[index] ?? "");
      }

      const content = sanitizeContent(tableLines.join("\n"));
      if (content) {
        units.push({ pageNumber, text: content, kind: "table" });
      }
      continue;
    }

    if (line.trim() === "") {
      flushPending();
      continue;
    }

    if (/^\s{0,3}#{1,6}\s+/.test(line)) {
      flushPending();
      units.push({ pageNumber, text: line, kind: "content" });
      continue;
    }

    pendingLines.push(line);
  }

  flushPending();
  return units;
}

function getPageUnits(page: OCRPageObject): ChunkUnit[] {
  const pageNumber = page.index + 1;
  const blockUnits = (page.blocks ?? []).flatMap((block) => {
    if (!("content" in block) || typeof block.content !== "string") return [];
    const content = sanitizeContent(block.content);
    if (!content) return [];
    return [
      {
        pageNumber,
        text: content,
        kind: block.type === "table" ? "table" : "content",
      } satisfies ChunkUnit,
    ];
  });

  return blockUnits.length > 0
    ? blockUnits
    : splitMarkdownIntoUnits(page.markdown, pageNumber);
}

function splitAtParagraphBoundaries(text: string) {
  return text.split(/\n[ \t]*\n+/).filter((part) => part.trim().length > 0);
}

function splitAtSentenceBoundaries(text: string) {
  const parts: string[] = [];
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const isLineBoundary = char === "\n";
    const isSentencePunctuation = char === "." || char === "!" || char === "?";
    let sentenceEnd = index + 1;
    if (isSentencePunctuation) {
      while (/["')\]]/.test(text[sentenceEnd] ?? "")) sentenceEnd += 1;
    }
    const isSentenceBoundary =
      isSentencePunctuation &&
      (sentenceEnd === text.length || /\s/.test(text[sentenceEnd] ?? ""));

    if (!isLineBoundary && !isSentenceBoundary) continue;

    let end = index + 1;
    if (isSentenceBoundary) {
      end = sentenceEnd;
      index = end - 1;
    }

    const part = text.slice(start, end);
    if (part.trim()) parts.push(part);
    start = end;
  }

  const remainder = text.slice(start);
  if (remainder.trim()) parts.push(remainder);
  return parts;
}

function hardSplitByWords(text: string, targetWords: number) {
  const words = Array.from(text.matchAll(/\S+/g));
  if (words.length <= targetWords) return [text];

  const parts: string[] = [];
  for (let startWord = 0; startWord < words.length; startWord += targetWords) {
    const endWord = Math.min(startWord + targetWords, words.length) - 1;
    const startOffset =
      startWord === 0 ? 0 : (words[startWord]?.index ?? text.length);
    const finalWord = words[endWord];
    const endOffset = finalWord
      ? (finalWord.index ?? 0) + finalWord[0].length
      : text.length;
    const part = text.slice(startOffset, endOffset);
    if (part.trim()) parts.push(part);
  }
  return parts;
}

function splitOversizedContentUnit(unit: ChunkUnit, targetWords: number) {
  if (unit.kind === "table" || countWords(unit.text) <= targetWords) {
    return [unit];
  }

  const paragraphs = splitAtParagraphBoundaries(unit.text);
  const paragraphUnits = paragraphs.length > 0 ? paragraphs : [unit.text];

  return paragraphUnits.flatMap((paragraph) => {
    if (countWords(paragraph) <= targetWords) {
      return [{ ...unit, text: paragraph }];
    }

    const sentences = splitAtSentenceBoundaries(paragraph);
    const sentenceUnits = sentences.length > 0 ? sentences : [paragraph];

    return sentenceUnits.flatMap((sentence) =>
      hardSplitByWords(sentence, targetWords).map((part) => ({
        ...unit,
        text: part,
      })),
    );
  });
}

function assembleChunk(units: ChunkUnit[], chunkIndex: number): DocumentChunk {
  const parts: string[] = [];
  const pageSpans: ChunkPageSpan[] = [];
  let currentOffset = 0;

  for (const unit of units) {
    if (parts.length > 0) {
      parts.push("\n\n");
      currentOffset += 2;
    }

    const startOffset = currentOffset;
    parts.push(unit.text);
    currentOffset += unit.text.length;

    const lastSpan = pageSpans[pageSpans.length - 1];
    if (lastSpan?.pageNumber === unit.pageNumber) {
      lastSpan.endOffset = currentOffset;
    } else {
      pageSpans.push({
        pageNumber: unit.pageNumber,
        startOffset,
        endOffset: currentOffset,
      });
    }
  }

  const text = parts.join("");
  return {
    chunkIndex,
    startPageNumber: pageSpans[0]?.pageNumber ?? 1,
    endPageNumber: pageSpans.at(-1)?.pageNumber ?? 1,
    text,
    tokenCount: countWords(text),
    pageSpans,
  };
}

function findOverlapStart(
  units: ChunkUnit[],
  chunkStart: number,
  chunkEnd: number,
  targetWords: number,
  overlapWords: number,
) {
  if (overlapWords <= 0 || chunkEnd - chunkStart <= 1) return chunkEnd;

  const nextUnitWords = countWords(units[chunkEnd]?.text ?? "");
  if (nextUnitWords > targetWords) return chunkEnd;

  let overlapStart = chunkEnd;
  let selectedWords = 0;

  for (let index = chunkEnd - 1; index > chunkStart; index -= 1) {
    const unit = units[index];
    if (!unit) continue;
    const unitWords = countWords(unit.text);
    if (unit.kind === "table" && unitWords > targetWords) break;

    overlapStart = index;
    selectedWords += unitWords;
    if (selectedWords >= overlapWords) break;
  }

  while (overlapStart < chunkEnd) {
    const overlapWordCount = units
      .slice(overlapStart, chunkEnd)
      .reduce((total, unit) => total + countWords(unit.text), 0);
    if (overlapWordCount + nextUnitWords <= targetWords) break;
    overlapStart += 1;
  }

  return overlapStart;
}

export function buildDocumentChunks(
  pages: OCRPageObject[],
  expectedPageCount: number,
  options: DocumentChunkingOptions = {},
): DocumentChunk[] {
  const targetWords = Math.max(
    1,
    Math.floor(options.targetWords ?? DEFAULT_CHUNK_WORD_TARGET),
  );
  const overlapWords = Math.max(
    0,
    Math.floor(options.overlapWords ?? DEFAULT_CHUNK_WORD_OVERLAP),
  );
  const orderedPages = [...pages].sort(
    (left, right) => left.index - right.index,
  );
  const units = orderedPages
    .flatMap(getPageUnits)
    .flatMap((unit) => splitOversizedContentUnit(unit, targetWords));

  if (units.length === 0) {
    const firstPage = orderedPages[0];
    const lastPage = orderedPages.at(-1);
    const startPageNumber = firstPage ? firstPage.index + 1 : 1;
    const highestDetectedPageNumber = lastPage
      ? lastPage.index + 1
      : startPageNumber;
    const endPageNumber = Math.max(
      startPageNumber,
      expectedPageCount,
      highestDetectedPageNumber,
    );

    return [
      {
        chunkIndex: 0,
        startPageNumber,
        endPageNumber,
        text: EMPTY_DOCUMENT_CHUNK_TEXT,
        tokenCount: countWords(EMPTY_DOCUMENT_CHUNK_TEXT),
        pageSpans: [
          {
            pageNumber: startPageNumber,
            startOffset: 0,
            endOffset: EMPTY_DOCUMENT_CHUNK_TEXT.length,
          },
        ],
      },
    ];
  }

  const chunks: DocumentChunk[] = [];
  let start = 0;

  while (start < units.length) {
    let end = start;
    let currentWords = 0;

    while (end < units.length) {
      const unitWords = countWords(units[end]?.text ?? "");
      if (end > start && currentWords + unitWords > targetWords) break;
      currentWords += unitWords;
      end += 1;
      if (unitWords > targetWords) break;
    }

    chunks.push(assembleChunk(units.slice(start, end), chunks.length));
    if (end >= units.length) break;

    start = findOverlapStart(units, start, end, targetWords, overlapWords);
  }

  return chunks;
}
