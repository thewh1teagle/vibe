import "@fontsource/roboto";
import { useTranslation } from "react-i18next";
import { Route, Routes } from "react-router-dom";
import "./globals.css";
import ErrorModal from "./components/ErrorModel";
import "./lib/i18n";
import SetupPage from "./pages/setup/SetupPage";
import TranscribePage from "./pages/transcribe/TranscribePage";
import { ErrorModalProvider } from "./providers/ErrorModalProvider";
import { UpdaterProvider } from "./providers/UpdaterProvider";
import UpdateProgress from "./components/UpdateProgress";
import { useWindowsState } from "./hooks/useWindowsState";
import ThemeToggle from "./components/ThemeToggle";

export default function App() {
    const { i18n } = useTranslation();
    document.body.dir = i18n.dir();

    useWindowsState()

    return (
        <ErrorModalProvider>
            <UpdaterProvider>
                <div className="absolute right-16 top-16">
                    <ThemeToggle />
                </div>
                <ErrorModal />
                <UpdateProgress />
                <Routes>
                    <Route path="/setup" element={<SetupPage />} />
                    <Route path="/" element={<TranscribePage />} />
                </Routes>
            </UpdaterProvider>
        </ErrorModalProvider>
    );
}
