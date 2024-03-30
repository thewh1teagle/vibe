import { path } from "@tauri-apps/api";
import * as fs from "@tauri-apps/plugin-fs"
import * as shell from "@tauri-apps/plugin-shell"
import * as pluginApp from "@tauri-apps/plugin-app";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useLocalStorage } from "usehooks-ts";
import { languages } from "../i18n";
import { cx, getAppInfo, getIssueUrl } from "../utils";
import * as config from "../config";
import { invoke } from "@tauri-apps/api/core";

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const [language, setLanguage] = useLocalStorage("language", i18n.language);
  const [modelPath, setModelPath] = useLocalStorage("model_path", "");
  const [models, setModels] = useState<fs.DirEntry[]>([]);
  const navigate = useNavigate();
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    i18n.changeLanguage(language);
  }, [language]);

  useEffect(() => {
    async function init() {
      if (!modelPath) {
        const defaultModelPath = (await invoke("get_default_model_path")) as string;
        setModelPath(defaultModelPath);
      }
    }
    init();
  }, []);

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
      try {
        const name = await pluginApp.getName();
        const ver = await pluginApp.getVersion();
        setAppVersion(`${name} ${ver}`);
      } catch (e) {
        console.error(e)
      }
      
    }
    loadMeta();
  }, []);

  async function openModelPath() {
    const configPath = await path.appLocalDataDir();
    shell.open(configPath);
  }

  async function openModelsUrl() {
    shell.open(config.modelsURL);
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
            <option key={index} value={model.name}>
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
        <button onClick={() => shell.open(config.aboutURL)} className="btn bg-base-300 text-base-content">
          {t("project-link")}
        </button>
        <button onClick={async () => shell.open(config.updateVersionURL)} className="btn bg-base-300 text-base-content">
          {t("update-version")}
        </button>
        <button onClick={async () => {
          try {
            const info = await getAppInfo()
            shell.open(await getIssueUrl(info))
          } catch (e) {
            console.error(e)
            shell.open(await getIssueUrl(`Couldn't get info ${e}`))
          }
          
        }} className="btn bg-base-300 text-base-content">
          {t("report-issue")}
        </button>
        <p className="text-center font-light mt-2">{appVersion}</p>
      </div>
    </div>
  );
}
