export interface GeneratedFile {
  /** Path relative to workspace root, e.g. "src/app/page.tsx" */
  path: string;
  content: string;
}

/**
 * Parses Claude's XML-structured response into file path/content pairs.
 *
 * Expected format:
 *   <files>
 *     <file path="app/page.tsx">
 *       // file content
 *     </file>
 *   </files>
 */
export function parseGeneratedFiles(responseText: string): GeneratedFile[] {
  let text = responseText;

  // Strip markdown code fences if present (```xml ... ```)
  text = text.replace(/```(?:xml|tsx|typescript)?\s*\n?([\s\S]*?)```/g, "$1");

  // Extract the <files>...</files> block
  const filesMatch = text.match(/<files>([\s\S]*?)<\/files>/);
  if (!filesMatch) {
    throw new Error(
      "No <files>...</files> block found in Claude response. " +
        "The model may have returned an unexpected format."
    );
  }

  const filesContent = filesMatch[1];

  // Extract each <file path="...">...</file> entry
  const filePattern = /<file\s+path="([^"]+)">([\s\S]*?)<\/file>/g;
  const files: GeneratedFile[] = [];
  let match: RegExpExecArray | null;

  while ((match = filePattern.exec(filesContent)) !== null) {
    let filePath = match[1].trim();
    const content = match[2];

    // Security: reject path traversal
    if (filePath.includes("..") || filePath.startsWith("/")) {
      console.warn(
        `[response-parser] Skipping unsafe path: ${filePath}`
      );
      continue;
    }

    // Normalize: ensure path starts with src/ (workspace convention)
    if (!filePath.startsWith("src/")) {
      filePath = `src/${filePath}`;
    }

    // Trim leading/trailing blank lines from content, but preserve indentation
    const trimmed = content.replace(/^\n+/, "").replace(/\n+$/, "");

    files.push({ path: filePath, content: trimmed + "\n" });
  }

  if (files.length === 0) {
    throw new Error(
      "No valid <file> entries found in the <files> block. " +
        "The model may have used an unexpected format."
    );
  }

  return files;
}
