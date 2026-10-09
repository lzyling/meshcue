// Bound accepted Windows pipe handles that never send complete HTTP headers.
// This is a first-request deadline, not a socket inactivity timeout: once a
// request arrives, its body/handler (including a 180s publish) is unaffected.
export function limitInitialPipeRequest(
  server,
  { platform = process.platform, timeout = 5000 } = {},
) {
  if (platform !== "win32") return;
  const timers = new WeakMap();
  function clear(socket) {
    clearTimeout(timers.get(socket));
    timers.delete(socket);
  }
  server.on("connection", (socket) => {
    timers.set(
      socket,
      setTimeout(() => socket.destroy(), timeout),
    );
    socket.once("close", () => clear(socket));
  });
  server.prependListener("request", (req) => clear(req.socket));
}
