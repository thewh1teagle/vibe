import { useTranslation } from "react-i18next";
import AudioInput from "../../components/AudioInput";
import LanguageInput from "../../components/LanguageInput";
import Params from "../../components/Params";
import TextArea from "../../components/TextArea";
import ThemeToggle from "../../components/ThemeToggle";
import { useTranscribeViewModel } from "./useTranscribeViewmodel";
import AppMenu from "../../components/AppMenu";

function App() {
    const { t } = useTranslation();
    const vm = useTranscribeViewModel();

    return (
        <div className="flex flex-col">
            <div className="flex flex-col m-auto w-[300px] mt-10">
                <div className="relative text-center">
                    <h1 className="text-center text-4xl mb-10">{t("app-title")}</h1>
                    <AppMenu availableUpdate={vm.availableUpdate} updateApp={vm.updateApp} />
                </div>
                <div className="absolute right-16 top-16">
                    <ThemeToggle />
                </div>
                <LanguageInput onChange={(lang) => vm.setLang(lang)} />
                <AudioInput audioRef={vm.audioRef} path={vm.audioPath} setPath={vm.setAudioPath} />
                {vm.audioPath && !vm.loading && (
                    <>
                        <button onClick={vm.transcribe} className="btn btn-primary">
                            {t("transcribe")}
                        </button>
                        <Params args={vm.args} setArgs={vm.setArgs} />
                    </>
                )}
            </div>
            <div className="h-20" />
            {vm.loading && (
                <div className="w-full flex flex-col items-center">
                    <div className="flex flex-row items-center text-center gap-3 bg-base-200 p-4 rounded-2xl">
                        <span className="loading loading-spinner text-primary"></span>
                        <p>
                            {t("transcribing")} {vm.progress ? `${vm.progress}%` : "0%"}
                        </p>
                        <button className="btn btn-primary btn-ghost btn-sm text-red-500">Stop</button>
                        {/* <p className="text-neutral-content">{t("you-will-receive-notification")}</p> */}
                    </div>
                </div>
            )}
            {(vm.transcript || vm.loading) && (
                <div className="flex flex-col mt-5 items-center w-[60%] max-w-[1000px] h-[45vh] m-auto">
                    <TextArea placeholder={t("transcript-will-displayed-shortly")} transcript={vm.transcript} readonly={vm.loading} />
                </div>
            )}
        </div>
    );
}

export default App;
