import { useContext } from "react";
import { cx } from "../lib/utils";
import { useTranslation } from "react-i18next";
import { UpdaterContext } from "../providers/UpdaterProvider";

export default function UpdateProgress() {
    const { manifest, progress, updating } = useContext(UpdaterContext);
    const { t } = useTranslation();

    return (
        <dialog className={cx("modal text-center", updating && "modal-open")}>
            <div className="modal-box">
                <h3 className="font-bold text-lg">{t("updating-modal-title")}</h3>
                <p className="py-4">{t("updating-modal-body", { version: manifest?.version })}</p>
                <div className="flex justify-center">
                    <progress className="progress w-56 progress-primary" value={progress ?? 0} max={100}></progress>
                </div>
            </div>
        </dialog>
    );
}
