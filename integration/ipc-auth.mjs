import http from "node:http";
import net from "node:net";
import crypto from "node:crypto";
import { pipeProof } from "../server/instance.mjs";

// Prove the server before sending an action/body, on the very connection used
// for that action. A stale-name squatter cannot learn the key from a challenge,
// and a disconnected authenticated socket may never silently reconnect.
export async function authenticatedPipeAgent(endpoint, timeout = 3000) {
  const socket = net.createConnection(endpoint.path);
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  let supplied = false;
  agent.createConnection = (_options, callback) => {
    if (supplied) {
      queueMicrotask(() =>
        callback(new Error("Authenticated IPC connection was lost.")),
      );
      return;
    }
    supplied = true;
    return socket;
  };
  const challenge = crypto.randomBytes(32).toString("hex");
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => socket.destroy(new Error("MeshCue IPC authentication timed out")),
        timeout,
      );
      const req = http.get(
        {
          agent,
          socketPath: endpoint.path,
          path: `/ipc-auth?challenge=${challenge}`,
        },
        (res) => {
          let data = "";
          res.on("data", (part) => {
            data += part;
            if (data.length > 1024)
              req.destroy(new Error("Invalid IPC proof."));
          });
          res.on("error", reject);
          res.on("end", () => {
            clearTimeout(timer);
            const expected = pipeProof(endpoint.key, challenge);
            if (
              res.statusCode !== 200 ||
              data !== expected ||
              res.headers.connection === "close"
            )
              reject(
                new Error(
                  "MeshCue IPC server authentication failed; no action was sent.",
                ),
              );
            else resolve();
          });
        },
      );
      req.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    return agent;
  } catch (error) {
    agent.destroy();
    socket.destroy();
    throw error;
  }
}
