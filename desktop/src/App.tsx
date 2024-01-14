import "@fontsource/roboto";
import { useTranslation } from "react-i18next";
import { Route, Routes } from "react-router-dom";
import "./App.css";
import "./i18n";
import SetupPage from "./pages/SetupPage";
import TranscribePage from "./pages/TranscribePage";

export default function App() {
  const { i18n } = useTranslation();
  document.body.dir = i18n.dir();

  return (
    <Routes>
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/" element={<TranscribePage />} />
    </Routes>
  );
}
