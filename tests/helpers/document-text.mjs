// Git may check text out as CRLF; documentation assertions compare LF text.
// Preserve all other characters, including whitespace and lone carriage returns.
export const normalizeDocumentText = (source) =>
  source.replaceAll("\r\n", "\n");
