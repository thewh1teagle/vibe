import React, { createContext, useContext, useEffect, useState } from "react";
import { Update, check as checkUpdate } from "@tauri-apps/plugin-updater";
import { useTranslation } from "react-i18next";
import * as dialog from "@tauri-apps/plugin-dialog";
import * as process from "@tauri-apps/plugin-process";
import { ErrorModalContext } from "./ErrorModalProvider";

// Define the context type
type UpdaterContextType = {
    availableUpdate: boolean;
    setAvailableUpdate: React.Dispatch<React.SetStateAction<boolean>>;
    updating: boolean;
    setUpdating: React.Dispatch<React.SetStateAction<boolean>>;
    manifest?: Update;
    setManifest: React.Dispatch<React.SetStateAction<Update | undefined>>;
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
    const [update, setUpdate] = useState<Update | undefined>();
    const [updating, setUpdating] = useState(false);
    const { setState: setErrorModal } = useContext(ErrorModalContext);
    const { t } = useTranslation();

    useEffect(() => {
        // Check for new updates
        async function checkForUpdates() {
            try {
                const newUpdate = await checkUpdate();
                if (newUpdate) {
                    setAvailableUpdate(newUpdate?.available);
                    setUpdate(newUpdate);
                }
            } catch (error) {
                console.error(error);
            }
        }
        checkForUpdates();
    }, []);

    async function updateApp() {
        const shouldUpdate = await dialog.ask(t("ask-for-update-body", { version: update?.version }), {
            title: t("ask-for-update-title"),
            kind: "info",
            cancelLabel: t("cancel-update"),
            okLabel: t("confirm-update"),
        });

        if (shouldUpdate) {
            setUpdating(true);
            console.info(`Installing update ${update?.version}, ${update?.date}, ${update?.body}`);
            try {
                await update?.downloadAndInstall();
                setUpdating(false);
                const shouldRelaunch = await dialog.ask(t("ask-for-relaunch-body"), {
                    title: t("ask-for-relaunch-title"),
                    kind: "info",
                    cancelLabel: t("cancel-relaunch"),
                    okLabel: t("confirm-relaunch"),
                });
                if (shouldRelaunch) {
                    console.info("relaunch....");
                    await process.relaunch();
                }
            } catch (e) {
                console.log(e);
                setUpdating(false);
                setErrorModal?.({ open: true, log: String(e) });
            }
        }
    }

    return (
        <UpdaterContext.Provider value={{ availableUpdate, setAvailableUpdate, manifest: update, setManifest: setUpdate, updating, setUpdating, updateApp }}>
            {children}
        </UpdaterContext.Provider>
    );
}
