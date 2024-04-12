import { useTranslation } from "react-i18next";
import ThemeToggle from "../../components/ThemeToggle";
import { useSetupViewModel } from "./useSetupViewmodel";

function App() {
    const { t } = useTranslation();
    const vm = useSetupViewModel();

    return (
        <div className="w-[100vw] h-[100vh] flex flex-col justify-center items-center">
            <div className="absolute right-16 top-16">
                <ThemeToggle />
            </div>
            <div className="text-3xl m-5 font-bold">{t("downloading-model")}</div>
            {vm.downloadProgress > 0 && (
                <>
                    <progress className="progress progress-primary w-56 my-2" value={vm.downloadProgress} max="100"></progress>
                    <p className="text-neutral-content">{t("this-happens-once")}</p>
                </>
            )}
            {vm.downloadProgress === 0 && <span className="loading loading-spinner loading-lg"></span>}
        </div>
    );
}

export default App;
