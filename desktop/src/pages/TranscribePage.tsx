import "@fontsource/roboto";
import {  path } from "@tauri-apps/api";
import * as fs from "@tauri-apps/plugin-fs"
import { listen } from "@tauri-apps/api/event";
import { useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useLocalStorage } from "usehooks-ts";
import successSound from "../assets/success.mp3";
import AudioInput from "../components/AudioInput";
import LanguageInput from "../components/LanguageInput";
import Params, { LocalModelArgs } from "../components/Params";
import TextArea from "../components/TextArea";
import ThemeToggle from "../components/ThemeToggle";
import { ErrorModalContext } from "../providers/ErrorModalProvider";
import * as transcript from "../transcript";
import UpdateProgress from "../components/UpdateProgress";
import { UpdaterContext } from "../providers/UpdaterProvider";
import { getCurrent } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";

function App() {
    const { t } = useTranslation();
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
        temperature: 0,
    });

    useEffect(() => {
        if (modelPath) {
            localStorage.setItem("model_path", JSON.stringify(modelPath));
        }
    }, [modelPath]);

    useEffect(() => {
        async function checkModelExists() {
            try {
                const configPath = await path.appLocalDataDir();

                const entries = await fs.readDir(configPath);

                const filtered = entries.filter((e) => e.name?.endsWith(".bin"));
                if (filtered.length === 0) {
                    navigate("/setup");
                } else {
                    // get default one from local storage or first
                    const storedPath = localStorage.getItem("model_path");
                    if (storedPath) {
                        setModelPath(JSON.parse(storedPath));
                    } else {
                        setModelPath(filtered[0].name);
                    }
                }
            } catch (e) {
                console.error(e);
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
            getCurrent().unminimize();
            getCurrent().setFocus();
            new Audio(successSound).play();
        }
    }

    if (loading) {
        return (
            <div className="w-56 m-auto h-[100vh] flex flex-col justify-center items-center">
                <div className="absolute right-16 top-16">
                    <ThemeToggle />
                </div>
                <div className="text-3xl m-5 font-bold">{t("transcribing")}</div>
                {(progress !== undefined && (
                    <>
                        <progress className="progress progress-primary w-56 my-2" value={progress} max="100"></progress>
                        <p className="text-neutral-content">{t("you-will-receive-notification")}</p>
                    </>
                )) || <span className="loading loading-spinner loading-lg"></span>}
                <div className="mt-5 w-full">
                    <AudioInput audioRef={audioRef} readonly={loading} path={audioPath ?? ""} setPath={setAudioPath} />
                </div>
            </div>
        );
    }
    return (
        <div className="flex flex-col">
            <UpdateProgress />
            <div className="flex flex-col m-auto w-[300px] mt-10">
                <div className="relative text-center">
                    <h1 className="text-center text-4xl mb-10">{t("app-title")}</h1>
                    <div className="dropdown dropdown-hover absolute left-0 top-0" dir="ltr">
                        <div>
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth="1.5"
                                stroke="currentColor"
                                className="w-6 h-6 cursor-pointer">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z"
                                />
                            </svg>
                            {availableUpdate && (
                                <svg className="w-2 h-2 absolute -top-0.5 left-3" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <circle cx="7" cy="7" r="7" fill="#518CFF" />
                                </svg>
                            )}
                        </div>

                        <div tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-52">
                            <li onClick={() => navigate("/settings")}>
                                <a>{t("settings")}</a>
                            </li>
                            {availableUpdate && (
                                <li onClick={() => updateApp()}>
                                    <a className="bg-primary">{t("update-version")}</a>
                                </li>
                            )}
                        </div>
                    </div>
                </div>

                <div className="absolute right-16 top-16">
                    <ThemeToggle />
                </div>
                <LanguageInput onChange={(lang) => setLang(lang)} />
                <AudioInput audioRef={audioRef} path={audioPath} setPath={setAudioPath} />
                {audioPath && (
                    <>
                        <button onClick={transcribe} className="btn btn-primary">
                            {t("transcribe")}
                        </button>
                        <Params args={args} setArgs={setArgs} />
                    </>
                )}
            </div>
            {transcript && (
                <div className="flex flex-col mt-20 items-center w-[60%] max-w-[1000px] h-[45vh] m-auto">
                    <TextArea transcript={transcript} />
                </div>
            )}
        </div>
    );
}

export default App;
