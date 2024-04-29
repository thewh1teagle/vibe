import * as shell from "@tauri-apps/plugin-shell";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { languages } from "../../lib/i18n";
import { cx } from "../../lib/utils";
import * as config from "../../lib/config";
import { useSettingsViewmodel } from "./useSettingsViewmodel";

export default function SettingsPage() {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const vm = useSettingsViewmodel();

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
                <select onChange={(e) => vm.setLanguage(e.target.value)} value={t(i18n.language)} className="select select-bordered">
                    <option>{t("select-language")}</option>
                    {Object.keys(languages).map((code, index) => (
                        <option key={index} value={code}>
                            {t(languages[code])}
                        </option>
                    ))}
                </select>
            </label>
            <div className="form-control mt-5">
                <label className="label cursor-pointer">
                    <span className="label-text">{t("play-sound-on-finish")}</span>
                    <input type="checkbox" className="toggle" onChange={(e) => vm.setSoundOnFinish(e.target.checked)} checked={vm.soundOnFinish} />
                </label>
                <label className="label cursor-pointer">
                    <span className="label-text">{t("focus-window-on-finish")}</span>
                    <input type="checkbox" className="toggle" onChange={(e) => vm.setFocusOnFinish(e.target.checked)} checked={vm.focusOnFinish} />
                </label>
            </div>

            <div className="label mt-10">
                <span className="label-text">{t("customize")}</span>
            </div>
            <div className="flex flex-col gap-1">
                <select onChange={(e) => vm.setModelPath(e.target.value)} value={vm.modelPath} className="select select-bordered flex-1">
                    <option>{t("select-model")}</option>
                    {vm.models.map((model, index) => (
                        <option key={index} value={model.path}>
                            {model.name}
                        </option>
                    ))}
                </select>

                <button onClick={vm.openModelPath} className="btn bg-base-300 text-base-content">
                    {t("open-models-path")}
                </button>
                <button onClick={vm.openModelsUrl} className="btn bg-base-300 text-base-content">
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
                <button onClick={vm.reportIssue} className="btn bg-base-300 text-base-content">
                    {t("report-issue")}
                </button>
                <p className="text-center font-light mt-2">{vm.appVersion}</p>
            </div>
        </div>
    );
}
