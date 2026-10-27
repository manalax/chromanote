export type DiffType = 'same' | 'add' | 'del';

export interface DiffPart {
  type: DiffType;
  text: string;
}

/** Above this many LCS table cells a changed block is shown as a whole removal plus addition. */
const MAX_CELLS = 4_000_000;

const lines = (text: string) => text.split(/(?<=\n)/).filter(Boolean);
const words = (text: string) => text.split(/(\s+)/).filter(Boolean);

function push(parts: DiffPart[], type: DiffType, text: string) {
  if (!text) return;
  const last = parts[parts.length - 1];
  if (last?.type === type) last.text += text;
  else parts.push({ type, text });
}

/** Token diff: shared prefix and suffix are trimmed, then the middle is diffed by longest common subsequence. */
function diffTokens(a: string[], b: string[]): DiffPart[] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const parts: DiffPart[] = [];
  push(parts, 'same', a.slice(0, start).join(''));
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const n = midA.length;
  const m = midB.length;
  if ((n + 1) * (m + 1) > MAX_CELLS) {
    push(parts, 'del', midA.join(''));
    push(parts, 'add', midB.join(''));
  } else {
    // lcs[i * w + j] = length of the LCS of midA[i..] and midB[j..].
    const w = m + 1;
    const lcs = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i * w + j] =
          midA[i] === midB[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && midA[i] === midB[j]) {
        push(parts, 'same', midA[i++]);
        j++;
      } else if (j >= m || (i < n && lcs[(i + 1) * w + j] >= lcs[i * w + j + 1])) {
        push(parts, 'del', midA[i++]);
      } else {
        push(parts, 'add', midB[j++]);
      }
    }
  }
  push(parts, 'same', a.slice(endA).join(''));
  return parts;
}

/**
 * Diffs two texts line by line, then word by word inside each changed block,
 * so small edits are highlighted precisely and large notes stay fast.
 */
export function diffText(before: string, after: string): DiffPart[] {
  const byLine = diffTokens(lines(before), lines(after));
  const parts: DiffPart[] = [];
  for (let k = 0; k < byLine.length; k++) {
    const part = byLine[k];
    const next = byLine[k + 1];
    if (part.type === 'del' && next?.type === 'add') {
      for (const p of diffTokens(words(part.text), words(next.text))) push(parts, p.type, p.text);
      k++;
    } else {
      push(parts, part.type, part.text);
    }
  }
  return parts;
}
