import "@fontsource/roboto";
import { Route, Routes } from "react-router-dom";
import "./App.css";
import "./i18n";
import SetupPage from "./pages/SetupPage";
import TranscribePage from "./pages/TranscribePage";

export default function App() {
  return (
    <Routes>
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/" element={<TranscribePage />} />
    </Routes>
  );
}
