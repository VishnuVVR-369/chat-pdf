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
  kind: "prose" | "atomic" | "table";
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

function splitMarkdownTableRow(line: string) {
  const normalized = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let currentCell = "";

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index] ?? "";
    if (character === "\\" && normalized[index + 1] === "|") {
      currentCell += "\\|";
      index += 1;
      continue;
    }
    if (character === "|") {
      cells.push(currentCell.trim());
      currentCell = "";
      continue;
    }
    currentCell += character;
  }

  cells.push(currentCell.trim());
  return cells;
}

function isMarkdownTableStart(lines: string[], index: number) {
  const header = lines[index];
  const delimiter = lines[index + 1];
  if (!header?.includes("|") || delimiter === undefined) return false;

  const headerCells = splitMarkdownTableRow(header);
  const delimiterCells = splitMarkdownTableRow(delimiter);
  return (
    headerCells.length === delimiterCells.length &&
    delimiterCells.length > 0 &&
    delimiterCells.every((cell) => /^:?-+:?$/.test(cell))
  );
}

function getFenceMarker(line: string) {
  return line.match(/^\s{0,3}(`{3,}|~{3,})/)?.[1] ?? null;
}

function findEquationEnd(lines: string[], index: number) {
  const trimmedLine = lines[index]?.trim() ?? "";
  if (trimmedLine.startsWith("$$") && trimmedLine.slice(2).includes("$$")) {
    return index;
  }

  const closingLine = trimmedLine === "\\[" ? "\\]" : "$$";
  for (
    let candidateIndex = index + 1;
    candidateIndex < lines.length;
    candidateIndex += 1
  ) {
    const candidate = lines[candidateIndex]?.trim() ?? "";
    if (
      closingLine === "$$"
        ? candidate.endsWith(closingLine)
        : candidate === closingLine
    ) {
      return candidateIndex;
    }
  }

  return -1;
}

function splitMarkdownSegmentIntoUnits(markdown: string, pageNumber: number) {
  const text = sanitizeContent(markdown);
  if (!text) return [];

  const lines = text.split("\n");
  const units: ChunkUnit[] = [];
  let pendingLines: string[] = [];

  const flushPending = () => {
    const content = sanitizeContent(pendingLines.join("\n"));
    pendingLines = [];
    if (content) {
      units.push({ pageNumber, text: content, kind: "prose" });
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
        units.push({ pageNumber, text: content, kind: "atomic" });
      }
      continue;
    }

    const trimmedLine = line.trim();

    if (trimmedLine.startsWith("$$") || trimmedLine === "\\[") {
      flushPending();
      const equationEnd = findEquationEnd(lines, index);
      const finalIndex = equationEnd >= index ? equationEnd : lines.length - 1;
      const content = sanitizeContent(
        lines.slice(index, finalIndex + 1).join("\n"),
      );
      if (content) {
        units.push({ pageNumber, text: content, kind: "atomic" });
      }
      index = finalIndex;
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
      units.push({ pageNumber, text: line, kind: "atomic" });
      continue;
    }

    if (/^(?: {4}|\t)\S/.test(line)) {
      flushPending();
      const indentedCodeLines = [line];
      while (
        index + 1 < lines.length &&
        (/^(?: {4}|\t)/.test(lines[index + 1] ?? "") ||
          (lines[index + 1]?.trim() === "" &&
            /^(?: {4}|\t)/.test(lines[index + 2] ?? "")))
      ) {
        index += 1;
        indentedCodeLines.push(lines[index] ?? "");
      }
      const content = sanitizeContent(indentedCodeLines.join("\n"));
      if (content) {
        units.push({ pageNumber, text: content, kind: "atomic" });
      }
      continue;
    }

    if (
      /^\s{0,3}(?:>|[-+*]\s+|\d+[.)]\s+|(?:[-*_]\s*){3,})/.test(line) ||
      /^\s{0,3}<[A-Za-z][^>]*>/.test(line)
    ) {
      flushPending();
      const structuralLines = [line];
      while (index + 1 < lines.length && lines[index + 1]?.trim() !== "") {
        index += 1;
        structuralLines.push(lines[index] ?? "");
      }
      const content = sanitizeContent(structuralLines.join("\n"));
      if (content) {
        units.push({ pageNumber, text: content, kind: "atomic" });
      }
      continue;
    }

    pendingLines.push(line);
  }

  flushPending();
  return units;
}

function splitMarkdownIntoUnits(page: OCRPageObject, pageNumber: number) {
  const markdown = sanitizeContent(page.markdown);
  const tables = (page.tables ?? []).flatMap((table) => {
    const content = sanitizeContent(table.content);
    return content ? [{ id: table.id, content }] : [];
  });
  const units: ChunkUnit[] = [];
  const resolvedTableIds = new Set<string>();
  let cursor = 0;

  while (cursor < markdown.length) {
    let nextTable:
      | { id: string; content: string; placeholderIndex: number }
      | undefined;

    for (const table of tables) {
      const placeholder = `[${table.id}](${table.id})`;
      const placeholderIndex = markdown.indexOf(placeholder, cursor);
      if (
        placeholderIndex >= 0 &&
        (nextTable === undefined ||
          placeholderIndex < nextTable.placeholderIndex)
      ) {
        nextTable = { ...table, placeholderIndex };
      }
    }

    if (!nextTable) break;
    units.push(
      ...splitMarkdownSegmentIntoUnits(
        markdown.slice(cursor, nextTable.placeholderIndex),
        pageNumber,
      ),
    );
    units.push({ pageNumber, text: nextTable.content, kind: "table" });
    resolvedTableIds.add(nextTable.id);
    cursor =
      nextTable.placeholderIndex + `[${nextTable.id}](${nextTable.id})`.length;
  }

  units.push(
    ...splitMarkdownSegmentIntoUnits(markdown.slice(cursor), pageNumber),
  );

  for (const table of tables) {
    if (
      !resolvedTableIds.has(table.id) &&
      !markdown.includes(table.content) &&
      !units.some(
        (unit) => unit.kind === "table" && unit.text === table.content,
      )
    ) {
      units.push({ pageNumber, text: table.content, kind: "table" });
    }
  }

  return units;
}

function getPageUnits(page: OCRPageObject): ChunkUnit[] {
  const pageNumber = page.index + 1;
  const tablesById = new Map(
    (page.tables ?? []).map((table) => [table.id, table.content]),
  );
  const blockUnits = (page.blocks ?? []).flatMap((block) => {
    if (!("content" in block) || typeof block.content !== "string") return [];
    const tableContent =
      block.type === "table" &&
      "tableId" in block &&
      typeof block.tableId === "string"
        ? tablesById.get(block.tableId)
        : undefined;
    const content = sanitizeContent(tableContent ?? block.content);
    if (!content) return [];
    return [
      {
        pageNumber,
        text: content,
        kind:
          block.type === "table"
            ? "table"
            : block.type === "text"
              ? "prose"
              : "atomic",
      } satisfies ChunkUnit,
    ];
  });

  return blockUnits.length > 0
    ? blockUnits
    : splitMarkdownIntoUnits(page, pageNumber);
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
  if (unit.kind !== "prose" || countWords(unit.text) <= targetWords) {
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

function takeWordSuffix(text: string, wordCount: number) {
  const words = Array.from(text.matchAll(/\S+/g));
  const firstWord = words[Math.max(0, words.length - wordCount)];
  return sanitizeContent(text.slice(firstWord?.index ?? 0));
}

function buildProseOverlapUnit(unit: ChunkUnit, overlapWords: number) {
  if (countWords(unit.text) <= overlapWords) return unit;

  const sentences = splitAtSentenceBoundaries(unit.text);
  const selectedSentences: string[] = [];
  let selectedWords = 0;

  for (let index = sentences.length - 1; index >= 0; index -= 1) {
    const sentence = sentences[index];
    if (!sentence) continue;
    const sentenceWords = countWords(sentence);
    if (sentenceWords > overlapWords && selectedSentences.length === 0) {
      return { ...unit, text: takeWordSuffix(sentence, overlapWords) };
    }
    if (
      selectedSentences.length > 0 &&
      selectedWords + sentenceWords > overlapWords
    ) {
      break;
    }
    selectedSentences.unshift(sentence);
    selectedWords += sentenceWords;
    if (selectedWords >= overlapWords) break;
  }

  const text = sanitizeContent(selectedSentences.join(""));
  return text ? { ...unit, text } : undefined;
}

function selectOverlapUnits(
  chunkUnits: ChunkUnit[],
  targetWords: number,
  overlapWords: number,
) {
  if (overlapWords <= 0) return [];

  const selectedUnits: ChunkUnit[] = [];
  let selectedWords = 0;

  for (let index = chunkUnits.length - 1; index >= 0; index -= 1) {
    const unit = chunkUnits[index];
    if (!unit) continue;
    const unitWords = countWords(unit.text);
    if (unit.kind !== "prose" && unitWords > targetWords) break;

    if (unit.kind === "prose" && unitWords > overlapWords) {
      const overlapUnit = buildProseOverlapUnit(unit, overlapWords);
      if (overlapUnit) selectedUnits.unshift(overlapUnit);
      break;
    }

    selectedUnits.unshift(unit);
    selectedWords += unitWords;
    if (selectedWords >= overlapWords) break;
  }

  return selectedUnits;
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
  let overlapUnits: ChunkUnit[] = [];

  while (start < units.length) {
    let end = start;
    const firstNewUnit = units[start];
    const shouldIsolateFirstUnit =
      firstNewUnit !== undefined &&
      firstNewUnit.kind !== "prose" &&
      countWords(firstNewUnit.text) > targetWords;
    const chunkUnits = shouldIsolateFirstUnit ? [] : [...overlapUnits];
    let currentWords = chunkUnits.reduce(
      (total, unit) => total + countWords(unit.text),
      0,
    );

    while (end < units.length) {
      const unitWords = countWords(units[end]?.text ?? "");
      if (end > start && currentWords + unitWords > targetWords) break;
      const unit = units[end];
      if (!unit) break;
      chunkUnits.push(unit);
      currentWords += unitWords;
      end += 1;
      if (unitWords > targetWords) break;
    }

    chunks.push(assembleChunk(chunkUnits, chunks.length));
    if (end >= units.length) break;

    overlapUnits = selectOverlapUnits(chunkUnits, targetWords, overlapWords);
    start = end;
  }

  return chunks;
}
