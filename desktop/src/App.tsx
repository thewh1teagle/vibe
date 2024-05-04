import "@fontsource/roboto";
import { useTranslation } from "react-i18next";
import { Route, Routes } from "react-router-dom";
import "./globals.css";
import ErrorModal from "./components/ErrorModel";
import "./lib/i18n";
import SettingsPage from "./pages/settings/SettingsPage";
import SetupPage from "./pages/setup/SetupPage";
import TranscribePage from "./pages/transcribe/TranscribePage";
import { ErrorModalProvider } from "./providers/ErrorModalProvider";
import { UpdaterProvider } from "./providers/UpdaterProvider";
import UpdateProgress from "./components/UpdateProgress";
import { useWindowsState } from "./hooks/useWindowsState";

export default function App() {
    const { i18n } = useTranslation();
    document.body.dir = i18n.dir();

    useWindowsState()

    return (
        <ErrorModalProvider>
            <UpdaterProvider>
                <ErrorModal />
                <UpdateProgress />
                <Routes>
                    <Route path="/setup" element={<SetupPage />} />
                    <Route path="/" element={<TranscribePage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                </Routes>
            </UpdaterProvider>
        </ErrorModalProvider>
    );
}
