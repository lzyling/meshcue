import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { readLock, processAlive } from "./lockfile.mjs";

// 2 (0.9.0): an origin is an owner and an optional route rather than a chat
// route, so a manager and an instance from either side of this line cannot
// agree on what a rebind means. An instance still answering the old contract is
// replaced by reopening the project; it is never left unreachable.
export const INTEGRATION_API = 2;
export const INSTANCE_SCHEMA = 1;

export function readInstance(config) {
  if (!config.instance) return null;
  const value = config.instance;
  if (
    value.schema !== INSTANCE_SCHEMA ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      value.id || "",
    ) ||
    !/^[a-f0-9]{32}$/.test(value.projectId || "")
  ) {
    throw new Error(
      "Unsupported or invalid MeshCue instance identity; data was not migrated.",
    );
  }
  return { id: value.id, projectId: value.projectId, schema: value.schema };
}

export function instanceCookieName(instance) {
  return instance
    ? `review_access_${instance.id.replaceAll("-", "")}`
    : "review_access";
}

// Darwin AF_UNIX names have a short byte limit. Managed instances keep their
// persistent state in the project but put only the ephemeral socket in a
// private, per-uid OS temporary directory. Legacy instances keep their path.
export function agentSocketPath(
  runtime,
  instance = null,
  platform = process.platform,
) {
  if (platform === "win32") return readPipeEndpoint(runtime).path;
  if (!instance) return path.join(runtime, "agent.sock");
  const key = crypto
    .createHash("sha256")
    .update(fs.realpathSync(runtime))
    .digest("hex")
    .slice(0, 24);
  return path.join(
    os.tmpdir(),
    `meshcue-${process.getuid?.() ?? "user"}`,
    `${key}.sock`,
  );
}

export function prepareSocketDirectory(
  socketPath,
  instance,
  platform = process.platform,
) {
  if (platform === "win32" || !instance) return;
  const directory = path.dirname(socketPath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const st = fs.lstatSync(directory);
  if (
    !st.isDirectory() ||
    st.isSymbolicLink() ||
    (process.getuid && st.uid !== process.getuid()) ||
    st.mode & 0o077
  ) {
    throw new Error("MeshCue IPC directory is not private to this user.");
  }
  if (Buffer.byteLength(socketPath) >= 104)
    throw new Error("MeshCue IPC path exceeds the platform limit.");
}

// Optional private lock fields; schema/API and public instance identity stay at
// their existing versions. A new nonce and proof key belong to each process,
// never to the project hash or a release. No discovery by guessing a pipe name.
export function pipeIdentity(platform = process.platform) {
  return platform === "win32"
    ? {
        ipcNonce: crypto.randomBytes(32).toString("hex"),
        ipcKey: crypto.randomBytes(32).toString("hex"),
      }
    : {};
}
export function pipePath(nonce) {
  if (!/^[a-f0-9]{64}$/.test(nonce || ""))
    throw new Error("Invalid IPC nonce.");
  return `\\\\.\\pipe\\meshcue-${nonce}`;
}
export function readPipeEndpoint(runtime, isAlive = processAlive) {
  const owner = readLock(path.join(runtime, "instance.lock"));
  if (!owner || !isAlive(owner.pid))
    throw new Error("MeshCue IPC owner is not running.");
  if (
    !/^[a-f0-9]{64}$/.test(owner.ipcKey || "") ||
    !/^[a-f0-9]{64}$/.test(owner.ipcNonce || "")
  ) {
    const error = new Error(
      "The running instance has no authenticated Windows IPC endpoint; stop the old service before reopening.",
    );
    error.code = "IPC_LEGACY";
    throw error;
  }
  return { path: pipePath(owner.ipcNonce), key: owner.ipcKey, pid: owner.pid };
}
export function pipeProof(key, challenge) {
  if (
    !/^[a-f0-9]{64}$/.test(key || "") ||
    !/^[a-f0-9]{64}$/.test(challenge || "")
  )
    throw new Error("Invalid IPC proof input.");
  return crypto
    .createHmac("sha256", Buffer.from(key, "hex"))
    .update(`meshcue-ipc-v1:${challenge}`)
    .digest("hex");
}

// Windows ignores POSIX mode bits. Protect the runtime's DACL *before* a
// nonce/key is published. Newly created locks inherit only this user's, SYSTEM's
// and Administrators' full access. Failure (including unavailable PowerShell or
// unsupported filesystems) is fatal, never a reason to run without protection.
export function preparePrivateRuntime(
  runtime,
  platform = process.platform,
  run = execFileSync,
) {
  if (platform !== "win32") return;
  const st = fs.lstatSync(runtime);
  if (!st.isDirectory() || st.isSymbolicLink())
    throw new Error("MeshCue runtime is not a plain directory.");
  const script = `
$ErrorActionPreference = 'Stop'
$p = $env:MESHCUE_PRIVATE_RUNTIME
$item = Get-Item -LiteralPath $p -Force
if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse point runtime refused' }
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$acl = New-Object Security.AccessControl.DirectorySecurity
$acl.SetSecurityDescriptorSddlForm("O:$($sid)D:P(A;OICI;FA;;;$($sid))(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)")
Set-Acl -LiteralPath $p -AclObject $acl
$actual = Get-Acl -LiteralPath $p
if (!$actual.AreAccessRulesProtected) { throw 'Runtime ACL inheritance was not disabled' }
if ($actual.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid) { throw 'Runtime owner mismatch' }
$rules = @($actual.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
$allowed = @($sid, 'S-1-5-18', 'S-1-5-32-544')
if ($rules.Count -ne 3) { throw 'Unexpected runtime ACL' }
foreach ($rule in $rules) {
  if ($rule.IsInherited -or $allowed -notcontains $rule.IdentityReference.Value -or
      $rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or
      $rule.FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl -or
      $rule.InheritanceFlags -ne ([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit)) {
    throw 'Unexpected runtime access rule'
  }
}
`;
  const executable = path.win32.join(
    process.env.SystemRoot || "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  run(
    executable,
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
    {
      env: { ...process.env, MESHCUE_PRIVATE_RUNTIME: runtime },
      stdio: ["ignore", "ignore", "pipe"],
      timeout: 10000,
      windowsHide: true,
    },
  );
}
