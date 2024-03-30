import { listen } from "@tauri-apps/api/event";
import { useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import ThemeToggle from "../components/ThemeToggle";
import { ErrorModalContext } from "../providers/ErrorModalProvider";
import { invoke } from "@tauri-apps/api/core";

function App() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [downloadProgress, setDownloadProgress] = useState(0);
  const downloadProgressRef = useRef(0);
  const { setState: setErrorModal } = useContext(ErrorModalContext);

  useEffect(() => {
    async function downloadModel() {
      listen("download_progress", (event) => {
        // event.event is the event name (useful if you want to use a single callback fn for multiple event types)
        // event.payload is the payload object
        const [current, total] = event.payload as [number, number];
        const newDownloadProgress = Number(current / total) * 100;

        if (newDownloadProgress > downloadProgressRef.current) {
          // for some reason it jumps if not
          setDownloadProgress(newDownloadProgress);
          downloadProgressRef.current = newDownloadProgress;
        }
      });
      try {
        await invoke("download_model");
        navigate("/");
      } catch (e: any) {
        console.error(e);
        setErrorModal?.({ open: true, log: e?.toString() });
      }
    }
    downloadModel();
  }, []);

  return (
    <div className="w-[100vw] h-[100vh] flex flex-col justify-center items-center">
      <div className="absolute right-16 top-16">
        <ThemeToggle />
      </div>
      <div className="text-3xl m-5 font-bold">{t("downloading-model")}</div>
      {downloadProgress > 0 && (
        <>
          <progress className="progress progress-primary w-56 my-2" value={downloadProgress} max="100"></progress>
          <p className="text-neutral-content">{t("this-happens-once")}</p>
        </>
      )}
      {downloadProgress === 0 && <span className="loading loading-spinner loading-lg"></span>}
    </div>
  );
}

export default App;
