import { extractEdges } from "./edges.js";
self.onmessage = ({ data }) => {
  const result = extractEdges(data);
  self.postMessage(result, [
    ...new Set(
      [result.feature, result.wire, result.faces, result.patches]
        .filter(Boolean)
        .map((array) => array.buffer),
    ),
  ]);
};
