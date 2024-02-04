import { UpdateManifest, checkUpdate } from "@tauri-apps/api/updater";
import { Dispatch, SetStateAction, useEffect } from "react";
import { cx } from "../utils";
import { useTranslation } from "react-i18next";

interface UpdaterProps {
  setAvailable: Dispatch<SetStateAction<boolean>>;
  updating: boolean;
  manifest?: UpdateManifest;
  setManifest: Dispatch<SetStateAction<UpdateManifest | undefined>>;
}

export default function Updater({ setAvailable, updating, setManifest, manifest }: UpdaterProps) {
  const { t } = useTranslation();

  useEffect(() => {
    // Check for new updates
    async function checkForUpdates() {
      try {
        const { shouldUpdate, manifest: newManifest } = await checkUpdate();
        setAvailable(shouldUpdate);
        setManifest(newManifest);
      } catch (error) {
        console.error(error);
      }
    }
    checkForUpdates();
  }, []);

  return (
    <dialog className={cx("modal text-center", updating && "modal-open")}>
      <div className="modal-box">
        <h3 className="font-bold text-lg">{t("updating-modal-title")}</h3>
        <p className="py-4">{t("updating-modal-body", { version: manifest?.version })}</p>
        <div className="flex justify-center">
          <progress className="progress w-56 progress-primary"></progress>
        </div>
      </div>
    </dialog>
  );
}
