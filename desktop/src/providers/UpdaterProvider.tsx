import React, { createContext, useContext, useEffect, useState } from "react";
import { UpdateManifest, checkUpdate, installUpdate } from "@tauri-apps/api/updater";
import { useTranslation } from "react-i18next";
import { ask } from "@tauri-apps/api/dialog";
import { relaunch } from "@tauri-apps/api/process";
import { ErrorModalContext } from "./ErrorModalProvider";

// Define the context type
type UpdaterContextType = {
  availableUpdate: boolean;
  setAvailableUpdate: React.Dispatch<React.SetStateAction<boolean>>;
  updating: boolean;
  setUpdating: React.Dispatch<React.SetStateAction<boolean>>;
  manifest?: UpdateManifest;
  setManifest: React.Dispatch<React.SetStateAction<UpdateManifest | undefined>>;
  updateApp: () => Promise<void>;
};

// Create the context
export const UpdaterContext = createContext<UpdaterContextType>({
  availableUpdate: false,
  setAvailableUpdate: () => {},
  updating: false,
  setUpdating: () => {},
  setManifest: () => {},
  updateApp: async () => {},
});

export function UpdaterProvider({ children }: { children: React.ReactNode }) {
  const [availableUpdate, setAvailableUpdate] = useState(false);
  const [manifest, setManifest] = useState<UpdateManifest | undefined>();
  const [updating, setUpdating] = useState(false);
  const { setState: setErrorModal } = useContext(ErrorModalContext);
  const { t } = useTranslation();

  useEffect(() => {
    // Check for new updates
    async function checkForUpdates() {
      try {
        const { shouldUpdate, manifest: newManifest } = await checkUpdate();
        setAvailableUpdate(shouldUpdate);
        setManifest(newManifest);
      } catch (error) {
        console.error(error);
      }
    }
    checkForUpdates();
  }, []);

  async function updateApp() {
    const shouldUpdate = await ask(t("ask-for-update-body", { version: manifest?.version }), {
      title: t("ask-for-update-title"),
      type: "info",
      cancelLabel: t("cancel-update"),
      okLabel: t("confirm-update"),
    });

    if (shouldUpdate) {
      setUpdating(true);
      console.info(`Installing update ${manifest?.version}, ${manifest?.date}, ${manifest?.body}`);
      try {
        await installUpdate();
        setUpdating(false);
        const shouldRelaunch = await ask(t("ask-for-relaunch-body"), {
          title: t("ask-for-relaunch-title"),
          type: "info",
          cancelLabel: t("cancel-relaunch"),
          okLabel: t("confirm-relaunch"),
        });
        if (shouldRelaunch) {
          console.info("relaunch....");
          await relaunch();
        }
      } catch (e) {
        console.log(e);
        setUpdating(false);
        setErrorModal?.({ open: true, log: String(e) });
      }
    }
  }

  return (
    <UpdaterContext.Provider value={{ availableUpdate, setAvailableUpdate, manifest, setManifest, updating, setUpdating, updateApp }}>
      {children}
    </UpdaterContext.Provider>
  );
}
