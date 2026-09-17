const { existsSync, readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');

const patches = [
  {
    packageDirectory: 'node_modules/@nestjs/graphql',
    patchFile: 'patches/@nestjs-graphql-13.4.5.patch',
  },
  {
    packageDirectory: 'node_modules/react-phone-number-input',
    patchFile: 'patches/react-phone-number-input-3.4.5.patch',
  },
  {
    packageDirectory: 'node_modules/typeorm',
    patchFile: 'patches/typeorm-0.3.31.patch',
  },
];

const sameLines = (leftLines, rightLines) =>
  leftLines.length === rightLines.length &&
  leftLines.every(
    (line, index) => line.replace(/\r$/, '') === rightLines[index],
  );

const applyHunk = (filePath, hunkHeader, hunkLines, lineOffset) => {
  const match = hunkHeader.match(
    /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/,
  );

  if (match === null) {
    throw new Error(`Invalid patch hunk: ${hunkHeader}`);
  }

  const oldStart = Number(match[1]) - 1 + lineOffset;
  const oldLines = hunkLines
    .filter((line) => line.startsWith(' ') || line.startsWith('-'))
    .map((line) => line.slice(1));
  const newLines = hunkLines
    .filter((line) => line.startsWith(' ') || line.startsWith('+'))
    .map((line) => line.slice(1));
  const content = readFileSync(filePath, 'utf8');
  const hasTrailingNewline = content.endsWith('\n');
  const fileLines = content.split('\n');
  if (hasTrailingNewline) {
    fileLines.pop();
  }

  const currentLines = fileLines.slice(oldStart, oldStart + oldLines.length);
  if (sameLines(currentLines, oldLines)) {
    fileLines.splice(oldStart, oldLines.length, ...newLines);
    writeFileSync(
      filePath,
      `${fileLines.join('\n')}${hasTrailingNewline ? '\n' : ''}`,
    );
    return newLines.length - oldLines.length;
  } else {
    const alreadyPatchedLines = fileLines.slice(
      oldStart,
      oldStart + newLines.length,
    );

    if (!sameLines(alreadyPatchedLines, newLines)) {
      throw new Error(`Patch does not match ${filePath}`);
    }

    return newLines.length - oldLines.length;
  }
};

const applyPatchFile = (packagePath, patchPath) => {
  const lines = readFileSync(patchPath, 'utf8').split(/\r?\n/);
  let filePath;
  let index = 0;
  const lineOffsets = new Map();

  while (index < lines.length) {
    if (lines[index].startsWith('+++ b/')) {
      filePath = resolve(packagePath, lines[index].slice('+++ b/'.length));
      index += 1;
      continue;
    }

    if (!lines[index].startsWith('@@ ')) {
      index += 1;
      continue;
    }

    if (filePath === undefined) {
      throw new Error(`Patch hunk has no target file: ${patchPath}`);
    }

    const hunkHeader = lines[index];
    const hunkLines = [];
    index += 1;
    while (
      index < lines.length &&
      !lines[index].startsWith('@@ ') &&
      !lines[index].startsWith('diff --git ')
    ) {
      if (lines[index] !== '\\ No newline at end of file') {
        hunkLines.push(lines[index]);
      }
      index += 1;
    }

    const lineOffset = lineOffsets.get(filePath) ?? 0;
    const offsetChange = applyHunk(
      filePath,
      hunkHeader,
      hunkLines,
      lineOffset,
    );
    lineOffsets.set(filePath, lineOffset + offsetChange);
  }
};

for (const { packageDirectory, patchFile } of patches) {
  const packagePath = resolve(__dirname, '..', packageDirectory);
  const patchPath = resolve(__dirname, '..', patchFile);

  if (!existsSync(packagePath) || !existsSync(patchPath)) {
    throw new Error(`Cannot apply npm patch: ${patchFile}`);
  }

  applyPatchFile(packagePath, patchPath);
}
