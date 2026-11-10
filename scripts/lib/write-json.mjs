/*
  write-json.mjs: save JSON without ever leaving a half-written file.
  We write to a temporary file first, then rename it over the real one.
  A rename is all-or-nothing, so if the script crashes mid-write,
  the old file is still there, untouched.
*/
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function writeJsonSafely(filePath, data) {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  // 2-space indent + final newline: readable, and clean diffs in Git
  await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await rename(tempPath, filePath);
}
