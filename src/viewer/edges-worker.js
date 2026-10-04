import { extractEdges } from "./edges.js";
self.onmessage = ({ data }) => {
  const result = extractEdges(data);
  self.postMessage(result, [
    ...new Set([result.feature.buffer, result.wire.buffer]),
  ]);
};
