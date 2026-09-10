import os from "node:os";
import net from "node:net";

export function privateIPv4(address) {
  if (net.isIP(address) !== 4) return false;
  const [a, b] = address.split(".").map(Number);
  return (
    a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  );
}
export function lanAddresses(interfaces = os.networkInterfaces()) {
  return Object.entries(interfaces).flatMap(([name, addresses]) =>
    (addresses || [])
      .filter(
        (a) => !a.internal && a.family === "IPv4" && privateIPv4(a.address),
      )
      .map((a) => ({
        interface: name,
        address: a.address,
        preferred: !/^(utun|tun|tap|veth|docker|bridge|vmnet|awdl|llw)/i.test(
          name,
        ),
      })),
  );
}
export function listenerConfig(
  value = "127.0.0.1",
  interfaces = os.networkInterfaces(),
) {
  if (["127.0.0.1", "localhost"].includes(value))
    return { host: "127.0.0.1", lan: false };
  const candidates = lanAddresses(interfaces);
  if (value === "lan") {
    const preferred = [
      ...new Set(candidates.filter((c) => c.preferred).map((c) => c.address)),
    ];
    if (preferred.length !== 1)
      throw new Error(
        "請先核對可達的內網介面，再明確指定 REVIEW_HOST；沒有開放監聽。",
      );
    return { host: preferred[0], lan: true };
  }
  if (candidates.some((c) => c.address === value))
    return { host: value, lan: true };
  throw new Error("REVIEW_HOST 只接受本機回環或已配置的內網 IPv4 位址。");
}
