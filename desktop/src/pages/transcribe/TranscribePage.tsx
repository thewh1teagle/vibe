import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import AudioInput from "../../components/AudioInput";
import LanguageInput from "../../components/LanguageInput";
import Params from "../../components/Params";
import TextArea from "../../components/TextArea";
import ThemeToggle from "../../components/ThemeToggle";
import { useTranscribeViewModel } from "./useTranscribeViewmodel";

function App() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const vm = useTranscribeViewModel();

    if (vm.loading) {
        return (
            <div className="w-56 m-auto h-[100vh] flex flex-col justify-center items-center">
                <div className="absolute right-16 top-16">
                    <ThemeToggle />
                </div>
                <div className="text-3xl m-5 font-bold">{t("transcribing")}</div>
                {(vm.progress !== undefined && (
                    <>
                        <progress className="progress progress-primary w-56 my-2" value={vm.progress} max="100"></progress>
                        <p className="text-neutral-content">{t("you-will-receive-notification")}</p>
                    </>
                )) || <span className="loading loading-spinner loading-lg"></span>}
                <div className="mt-5 w-full">
                    <AudioInput audioRef={vm.audioRef} readonly={vm.loading} path={vm.audioPath ?? ""} setPath={vm.setAudioPath} />
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col">
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
                            {vm.availableUpdate && (
                                <svg className="w-2 h-2 absolute -top-0.5 left-3" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <circle cx="7" cy="7" r="7" fill="#518CFF" />
                                </svg>
                            )}
                        </div>

                        <div tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-52">
                            <li onClick={() => navigate("/settings")}>
                                <a>{t("settings")}</a>
                            </li>
                            {vm.availableUpdate && (
                                <li onClick={() => vm.updateApp()}>
                                    <a className="bg-primary">{t("update-version")}</a>
                                </li>
                            )}
                        </div>
                    </div>
                </div>
                <div className="absolute right-16 top-16">
                    <ThemeToggle />
                </div>
                <LanguageInput onChange={(lang) => vm.setLang(lang)} />
                <AudioInput audioRef={vm.audioRef} path={vm.audioPath} setPath={vm.setAudioPath} />
                {vm.audioPath && (
                    <>
                        <button onClick={vm.transcribe} className="btn btn-primary">
                            {t("transcribe")}
                        </button>
                        <Params args={vm.args} setArgs={vm.setArgs} />
                    </>
                )}
            </div>
            {vm.transcript && (
                <div className="flex flex-col mt-20 items-center w-[60%] max-w-[1000px] h-[45vh] m-auto">
                    <TextArea transcript={vm.transcript} />
                </div>
            )}
        </div>
    );
}

export default App;
