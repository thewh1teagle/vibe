import { fs, os, path, shell } from "@tauri-apps/api";
import { getName, getVersion } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useLocalStorage } from "usehooks-ts";
import { languages } from "../i18n";
import { cx } from "../utils";

async function getAppInfo() {
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
App Version: \`${appVersion}\`
Arch: \`${arch}\`
Platform: \`${platform}\`
Kernel Version: \`${kVer}\`
OS: \`${osType}\`
OS Version: \`${osVer}\`
Models: \`${models}\`
Default Mode: \`${defaultModel}\`
  `;
}

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const [language, setLanguage] = useLocalStorage("language", i18n.language);
  const [modelPath, setModelPath] = useLocalStorage("model_path", "");
  const [models, setModels] = useState<fs.FileEntry[]>([]);
  const navigate = useNavigate();
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    i18n.changeLanguage(language);
  }, [language]);

  useEffect(() => {
    async function loadModels() {
      const configPath = await path.appLocalDataDir();
      const entries = await fs.readDir(configPath);
      const found = entries.filter((e) => e.name?.endsWith(".bin"));
      setModels(found);
    }
    loadModels();
  }, []);

  useEffect(() => {
    async function loadMeta() {
      const name = await getName();
      const ver = await getVersion();
      setAppVersion(`${name} ${ver}`);
    }
    loadMeta();
  }, []);

  async function openModelPath() {
    const configPath = await path.appLocalDataDir();
    console.log("open folder => ", configPath);
    shell.open(configPath);
  }

  async function openModelsUrl() {
    shell.open("https://huggingface.co/ggerganov/whisper.cpp");
  }

  return (
    <div className="flex flex-col m-auto w-[300px] mt-10">
      <div className="relative mt-10">
        <button onClick={() => navigate(-1)} className={cx("btn btn-square btn-ghost absolute start-0")}>
          {i18n.dir() === "ltr" ? (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          )}
        </button>
        <div className="text-4xl text-center">{t("settings")}</div>
      </div>

      <label className="form-control w-full mt-10">
        <div className="label">
          <span className="label-text">{t("language")}</span>
        </div>
        <select onChange={(e) => setLanguage(e.target.value)} value={i18n.language} className="select select-bordered">
          {Object.keys(languages).map((code, index) => (
            <option key={index} value={code}>
              {languages[code]}
            </option>
          ))}
        </select>
      </label>

      <div className="label mt-10">
        <span className="label-text">{t("customise")}</span>
      </div>
      <div className="flex flex-col gap-1">
        <select onChange={(e) => setModelPath(e.target.value)} value={modelPath} className="select select-bordered">
          {models.map((model, index) => (
            <option key={index} value={model.path}>
              {model.name}
            </option>
          ))}
        </select>
        <button onClick={openModelPath} className="btn bg-base-300 text-base-content">
          {t("open-models-path")}
        </button>
        <button onClick={openModelsUrl} className="btn bg-base-300 text-base-content">
          {t("download-models-link")}
        </button>
      </div>

      <div className="label mt-10">
        <span className="label-text">{t("general")}</span>
      </div>

      <div className="flex flex-col gap-1">
        <button onClick={() => shell.open("https://github.com/thewh1teagle/vibe")} className="btn bg-base-300 text-base-content">
          {t("project-link")}
        </button>
        <button
          onClick={async () => {
            const info = await getAppInfo();
            shell.open(`https://github.com/thewh1teagle/vibe/issues/new?title=[Bug]:&body=Hello%21%0AI%20experience%20...%0A%0A%0A${encodeURIComponent(info)}`);
          }}
          className="btn bg-base-300 text-base-content">
          {t("report-issue")}
        </button>
        <p className="text-center font-light mt-2">{appVersion}</p>
      </div>
    </div>
  );
}
