import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

interface AppMenuProps {
    availableUpdate: boolean;
    updateApp: () => void;
}

export default function AppMenu({ availableUpdate, updateApp }: AppMenuProps) {
    const navigate = useNavigate();
    const { t } = useTranslation();
    return (
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
    );
}
