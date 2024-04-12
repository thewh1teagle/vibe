import "@fontsource/roboto";
import { path } from "@tauri-apps/api";
import { listen } from "@tauri-apps/api/event";
import { useContext, useEffect, useRef, useState } from "react";
import { useLocalStorage } from "usehooks-ts";
import successSound from "../../assets/success.mp3";
import { LocalModelArgs } from "../../components/Params";
import { ErrorModalContext } from "../../providers/ErrorModalProvider";
import * as transcript from "../../lib/transcript";
import { UpdaterContext } from "../../providers/UpdaterProvider";
import * as webview from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
import { ls } from "../../lib/utils";
import { useNavigate } from "react-router-dom";

export function useTranscribeViewModel() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [transcript, setTranscript] = useState<transcript.Transcript>();
    const [lang, setLang] = useLocalStorage("lang", "en");
    const [progress, setProgress] = useState<number | undefined>();
    const [audioPath, setAudioPath] = useState<string>();
    const [modelPath, setModelPath] = useState<string>();
    const audioRef = useRef<HTMLAudioElement>();
    const { updateApp, availableUpdate } = useContext(UpdaterContext);
    const { setState: setErrorModal } = useContext(ErrorModalContext);
    const [args, setArgs] = useLocalStorage<LocalModelArgs>("model_args", {
        init_prompt: "",
        verbose: false,
        lang,
        n_threads: 4,
        temperature: 0.4,
    });

    async function handleEvents() {
        await listen("transcribe_progress", (event) => {
            setProgress(event.payload as number);
        });
    }

    async function checkModelExists() {
        try {
            const configPath = await path.appLocalDataDir();

            const entries = await ls(configPath);

            const filtered = entries.filter((e) => e.name?.endsWith(".bin"));
            if (filtered.length === 0) {
                navigate("/setup");
            } else {
                // get default one from local storage or first
                const storedPath = localStorage.getItem("model_path");
                if (storedPath) {
                    setModelPath(JSON.parse(storedPath));
                } else {
                    const absPath = await path.join(configPath, filtered[0].name);
                    setModelPath(absPath);
                }
            }
        } catch (e) {
            console.error(e);
            navigate("/setup");
        }
    }

    useEffect(() => {
        // make this window visible at start for any case
        webview.getCurrent().show();
        checkModelExists();
        handleEvents();
    }, []);

    useEffect(() => {
        if (modelPath) {
            localStorage.setItem("model_path", JSON.stringify(modelPath));
        }
    }, [modelPath]);

    async function transcribe() {
        setLoading(true);
        try {
            const res: transcript.Transcript = await invoke("transcribe", { options: { ...args, model: modelPath, path: audioPath, lang } });
            setLoading(false);
            setProgress(0);
            setTranscript(res);
        } catch (e: any) {
            console.error("error: ", e);
            setErrorModal?.({ log: e.toString(), open: true });
            setLoading(false);
        } finally {
            // Focus back the window and play sound
            webview.getCurrent().unminimize();
            webview.getCurrent().setFocus();
            new Audio(successSound).play();
        }
    }

    return {
        loading,
        progress,
        audioRef,
        audioPath,
        setAudioPath,
        availableUpdate,
        updateApp,
        transcript,
        args,
        setArgs,
        transcribe,
        setLang,
    };
}
