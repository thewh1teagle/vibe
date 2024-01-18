import { fs, os, path } from "@tauri-apps/api";
import { getVersion } from "@tauri-apps/api/app";

export function cx(...cns: (boolean | string | undefined)[]): string {
  return cns.filter(Boolean).join(" ");
}

export async function getAppInfo() {
  const appVersion = await getVersion();
  const arch = await os.arch();
  const platform = await os.platform();
  const kVer = await os.version();
  const osType = await os.type();
  const osVer = await os.version();
  const configPath = await path.appLocalDataDir();
  const entries = await fs.readDir(configPath);
  const models = entries
    .filter((e) => e.name?.endsWith(".bin"))
    .map((e) => e.name)
    .join(", ");
  const defaultModel = localStorage.getItem("model_path")?.split("/")?.pop() ?? "Not Found";
  return `
App Version: ${appVersion}
Arch: ${arch}
Platform: ${platform}
Kernel Version: ${kVer}
OS: ${osType}
OS Version: ${osVer}
Models: ${models}
Default Mode: ${defaultModel}
  `;
}

export async function getIssueUrl(logs: string) {
  return `https://github.com/thewh1teagle/vibe/issues/new?assignees=octocat&labels=bug&projects=&template=bug_report.yaml&title=Bug:&logs=${encodeURIComponent(
    logs
  )}`;
}
