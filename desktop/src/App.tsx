import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import "./App.css";
import ThemeToggle from "./components/ThemeToggle";
import { save } from "@tauri-apps/api/dialog";
import { fs } from "@tauri-apps/api";
import LanguageInput from "./components/LanguageInput";
import AudioInput from "./components/AudioInput";
import { message as dialogMessage } from "@tauri-apps/api/dialog";
import { appWindow } from "@tauri-apps/api/window";
import successSound from "./assets/success.wav";
import * as transcript from "./transcript";
import { listen } from "@tauri-apps/api/event";

function App() {
  const [path, setPath] = useState("");
  const [modelExists, setModelExists] = useState(false)
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [lang, setLang] = useState("");
  const [progress, setProgress] = useState(0);
  const [downloadProgress, setDownloadProgress] = useState(0)

  useEffect(() => {
    async function handleEvents() {
      await listen("transcribe_progress", (event) => {
        // event.event is the event name (useful if you want to use a single callback fn for multiple event types)
        // event.payload is the payload object
        setProgress(event.payload as number);
      });
    }
    handleEvents();
  }, []);

  useEffect(() => {
    async function checkModelExists() {
      const path: string = await invoke('get_model_path')
      const exists = await fs.exists(path)
      setModelExists(exists)
      if (!exists) {
        console.log('listening for download progress')
        await listen("download_progress", (event) => {
          console.log(event)
          // event.event is the event name (useful if you want to use a single callback fn for multiple event types)
          // event.payload is the payload object
          const [current, total] = event.payload as [number, number]
          const newDownloadProgress = Number(current / total) * 100
          console.log(newDownloadProgress)
          if (newDownloadProgress > downloadProgress) { // for some reason it jumps if not
            setDownloadProgress(newDownloadProgress);
          }
          
        });
        try {
          await invoke('download_model')
        } catch (e: any) {
          console.error(e)
          await dialogMessage(e?.toString(), { title: "Error", type: "error" });
        }
        setModelExists(true)
        setDownloadProgress(0)
      } else {
        console.log('found model in ', path)
      }
    }
    checkModelExists()
  }, [])

  
  async function download() {
    const filePath = await save({
      filters: [
        {
          name: "Text",
          extensions: ["txt"],
        },
      ],
    });
    if (filePath) {
      fs.writeTextFile(filePath, text);
    }
  }


  async function transcribe() {
    setLoading(true);
    try {
      const res: transcript.Transcript = await invoke("transcribe", { path, lang });
      console.log(transcript.asSrt(res));
      setLoading(false);
      setProgress(0);
      new Audio(successSound).play();
      console.log("result => ", res);
      setText(transcript.asSrt(res));
      setPath("");
    } catch (e: any) {
      console.error("error: ", e);
      await dialogMessage(e?.toString(), { title: "Error", type: "error" });
      setLoading(false);
      setPath("");
    } finally {
      appWindow.unminimize();
      appWindow.setFocus();
    }
  }

  if (!modelExists) {
    return (
      <div className="w-[100vw] h-[100vh] flex flex-col justify-center items-center">
        <div className="absolute right-16 top-16">
          <ThemeToggle />
        </div>
        <div className="text-3xl m-5 font-bold">Downloading OpenAI Model...</div>
        {downloadProgress > 0 && (
          <>
          <progress
            className="progress progress-primary w-56 my-2"
            value={downloadProgress}
            max="100"
          ></progress>
          <p className="text-neutral-content">This happens only once! 🎉</p>
          </>
        )}
        {downloadProgress === 0 && (
          <span className="loading loading-spinner loading-lg"></span>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="w-[100vw] h-[100vh] flex flex-col justify-center items-center">
        <div className="absolute right-16 top-16">
          <ThemeToggle />
        </div>
        <div className="text-3xl m-5 font-bold">Transcribing...</div>
        {progress > 0 && (
          <>
          <progress
            className="progress progress-primary w-56 my-2"
            value={progress}
            max="100"
          ></progress>
          <p className="text-neutral-content">You'll receive a notification when it's done! 🎉</p>
          </>
        )}
        {progress === 0 && (
          <span className="loading loading-spinner loading-lg"></span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col m-auto w-[300px] mt-10">
        <h1 className="text-center text-4xl mb-10">Vibe!</h1>
        <div className="absolute right-16 top-16">
          <ThemeToggle />
        </div>
        <LanguageInput onChange={(lang) => setLang(lang)} />
        <AudioInput onChange={(newPath) => setPath(newPath)} />
        {path && (
          <button onClick={transcribe} className="btn btn-primary">
            Transcribe
          </button>
        )}
      </div>
      {text && (
        <div className="flex flex-col mt-20 items-center w-[60%] m-auto">
          <div className="w-full flex gap-3">
            <button
              onClick={() => navigator.clipboard.writeText(text)}
              className="btn btn-primary"
            >
              Copy
            </button>
            <button onClick={download} className="btn btn-primary">
              Download
            </button>
          </div>
          <textarea
            className="textarea textarea-bordered textarea-primary h-[50vh] w-full mt-2"
            defaultValue={text}
          />
        </div>
      )}
    </div>
  );
}

export default App;
