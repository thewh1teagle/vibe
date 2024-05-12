import * as fs from "@tauri-apps/plugin-fs";
import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ErrorModalContext } from "../providers/ErrorModalProvider";
import { cx, getAppInfo, getIssueUrl } from "../lib/utils";
import * as shell from "@tauri-apps/plugin-shell";
import { useLocalStorage } from "usehooks-ts";

export default function ErrorModal() {
    const { t } = useTranslation();
    const { state, setState } = useContext(ErrorModalContext);
    const navigate = useNavigate();
    const [modelPath, _setModelPath] = useLocalStorage<string | null>("model_path", null);

    async function resetApp() {
        try {
            if (modelPath) {
                await fs.remove(modelPath);
            }
            localStorage.clear();
            setState?.({ open: false, log: "" });
        } catch (e) {
            console.error(e);
        }
        // Reload page
        navigate(0);
    }
    async function reportIssue() {
        let info = "";
        try {
            info = await getAppInfo();
        } catch (e) {
            console.error(e);
            info = `Couldn't get info: ${e}`;
        }

        const url = await getIssueUrl(state?.log + "\n" + info);
        shell.open(url);
    }

    return (
        <dialog id="modal-error" className={cx("modal", state?.open && "modal-open")}>
            <div className="modal-box">
                <h3 className="font-bold text-lg">{t("error-title")}</h3>
                <p className="py-4">{t("modal-error-body")}</p>
                <div className="relative">
                    <textarea readOnly className="w-full rounded-lg p-3 max-h-20 textarea textarea-bordered" dir="ltr" value={state?.log} />
                    <svg
                        onMouseDown={() => navigator.clipboard.writeText(state?.log ?? "")}
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        className="w-6 h-6 z-10 right-4 bottom-4 absolute strokeBase-content opacity-50 cursor-pointer">
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75"
                        />
                    </svg>
                </div>
                <div className="flex justify-center gap-3 mt-3">
                    <button onClick={resetApp} className="btn btn-primary cursor-pointer">
                        {t("reset-app")}
                    </button>
                    <button onMouseDown={reportIssue} className="btn btn-outline">
                        {t("report-issue")}
                    </button>
                </div>
                <div className="modal-action">
                    <form method="dialog">
                        <button onClick={() => setState?.({ log: "", open: false })} className="btn cursor-pointer">
                            {t("modal-close")}
                        </button>
                    </form>
                </div>
            </div>
        </dialog>
    );
}
