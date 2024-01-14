import "@fontsource/roboto";
import { fs } from "@tauri-apps/api";
import { message as dialogMessage } from "@tauri-apps/api/dialog";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/tauri";
import { appWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import successSound from "../assets/success.mp3";
import AudioInput from "../components/AudioInput";
import LanguageInput from "../components/LanguageInput";
import TextArea from "../components/TextArea";
import ThemeToggle from "../components/ThemeToggle";
import * as transcript from "../transcript";

function App() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [path, setPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [transcript, setTranscript] = useState<transcript.Transcript>();
  const [lang, setLang] = useState("");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    async function checkModelExists() {
      const path: string = await invoke("get_model_path");
      const exists = await fs.exists(path);
      console.log(`path ${path} exists => `, exists);
      if (!exists) {
        navigate("/setup");
      }
    }
    checkModelExists();
  }, []);

  useEffect(() => {
    async function handleEvents() {
      await listen("transcribe_progress", (event) => {
        setProgress(event.payload as number);
      });
    }
    handleEvents();
  }, []);

  async function transcribe() {
    setLoading(true);
    try {
      const res: transcript.Transcript = await invoke("transcribe", { path, lang });
      setLoading(false);
      setProgress(0);
      setTranscript(res);
      setPath("");
    } catch (e: any) {
      console.error("error: ", e);
      await dialogMessage(e?.toString(), {
        title: "Error",
        type: "error",
      });
      setLoading(false);
      setPath("");
    } finally {
      // Focus back the window and play sound
      appWindow.unminimize();
      appWindow.setFocus();
      new Audio(successSound).play();
    }
  }

  if (loading) {
    return (
      <div className="w-[100vw] h-[100vh] flex flex-col justify-center items-center">
        <div className="absolute right-16 top-16">
          <ThemeToggle />
        </div>
        <div className="text-3xl m-5 font-bold">{t("transcribing")}</div>
        {progress > 0 && (
          <>
            <progress className="progress progress-primary w-56 my-2" value={progress} max="100"></progress>
            <p className="text-neutral-content">{t("you-will-receive-notification")}</p>
          </>
        )}
        {progress === 0 && <span className="loading loading-spinner loading-lg"></span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col m-auto w-[300px] mt-10">
        <h1 className="text-center text-4xl mb-10">{t("app-title")}</h1>
        <div className="absolute right-16 top-16">
          <ThemeToggle />
        </div>
        <LanguageInput onChange={(lang) => setLang(lang)} />
        <AudioInput onChange={(newPath) => setPath(newPath)} />
        {path && (
          <button onClick={transcribe} className="btn btn-primary">
            {t("transcribe")}
          </button>
        )}
      </div>
      {transcript && (
        <div className="flex flex-col mt-20 items-center w-[60%] max-w-[1000px] h-[70vh] max-h-[600px] m-auto">
          <TextArea transcript={transcript} />
        </div>
      )}
    </div>
  );
}

export default App;
