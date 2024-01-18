import "@fontsource/roboto";
import { useTranslation } from "react-i18next";
import { Route, Routes } from "react-router-dom";
import "./App.css";
import ErrorModal from "./components/ErrorModel";
import "./i18n";
import SettingsPage from "./pages/SettingsPage";
import SetupPage from "./pages/SetupPage";
import TranscribePage from "./pages/TranscribePage";
import { ErrorModalProvider } from "./providers/ErrorModalProvider";

export default function App() {
  const { i18n } = useTranslation();
  document.body.dir = i18n.dir();

  return (
    <ErrorModalProvider>
      <ErrorModal />
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/" element={<TranscribePage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </ErrorModalProvider>
  );
}
