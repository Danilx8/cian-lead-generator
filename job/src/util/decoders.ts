import { logAdminError } from "../logger";

export function decodeString(encodedStr: string): string {
  try {
    // Replace \\x.. sequences with actual bytes
    const hexPattern = /\\x([0-9A-Fa-f]{2})/g;
    const bytes: number[] = [];
    let lastIndex = 0;
    let match;

    while ((match = hexPattern.exec(encodedStr)) !== null) {
      // Add any literal characters before this match
      for (let i = lastIndex; i < match.index; i++) {
        bytes.push(encodedStr.charCodeAt(i));
      }
      // Add the hex byte
      bytes.push(parseInt(match[1], 16));
      lastIndex = match.index + match[0].length;
    }

    // Add remaining literal characters
    for (let i = lastIndex; i < encodedStr.length; i++) {
      bytes.push(encodedStr.charCodeAt(i));
    }

    // Decode UTF-8 bytes to string
    const decoded = new TextDecoder("utf-8").decode(new Uint8Array(bytes));

    // Handle other escape sequences
    return decoded.replace(/\\n/g, "\n");
  } catch (e: unknown) {
    logAdminError(`Decoding error: ${e instanceof Error ? e.message : String(e)}`);
    return encodedStr;
  }
}