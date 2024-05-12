import * as fs from "@tauri-apps/plugin-fs";
import * as dialog from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocalStorage } from "usehooks-ts";
import { Segment, asSrt, asText, asVtt } from "../lib/transcript";
import { cx } from "../lib/utils";

type TextFormat = "normal" | "srt" | "vtt";
type FormatExtensions = {
    [name in TextFormat]: string;
};
const formatExtensions: FormatExtensions = {
    normal: ".txt",
    srt: ".srt",
    vtt: ".vtt",
};

async function download(text: string, format: TextFormat) {
    const ext = formatExtensions[format].slice(1);
    const filePath = await dialog.save({
        filters: [
            {
                name: "",
                extensions: [ext],
            },
        ],
    });
    if (filePath) {
        fs.writeTextFile(filePath, text);
    }
}

export default function TextArea({ segments, readonly, placeholder }: { segments: Segment[] | null; readonly: boolean; placeholder?: string }) {
    const { t, i18n } = useTranslation();
    const [direction, setDirection] = useLocalStorage<"ltr" | "rtl">("direction", i18n.dir());
    const [format, setFormat] = useLocalStorage<TextFormat>("format", "normal");
    const [text, setText] = useState("");

    useEffect(() => {
        if (segments) {
            setText(format === "vtt" ? asVtt(segments) : format === "srt" ? asSrt(segments) : asText(segments));
        } else {
            setText("");
        }
    }, [format, segments]);

    return (
        <div className="w-full h-full">
            <div className=" w-full bg-base-200 rounded-tl-lg rounded-tr-lg flex flex-row">
                <button className="btn btn-square btn-md" onMouseDown={() => navigator.clipboard.writeText(text)}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75"
                        />
                    </svg>
                </button>
                <button onMouseDown={() => download(text, format)} className="btn btn-square btn-md">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="m9 13.5 3 3m0 0 3-3m-3 3v-6m1.06-4.19-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
                        />
                    </svg>
                </button>
                <div dir="rtl">
                    <button onMouseDown={() => setDirection("rtl")} className={cx("btn btn-square btn-md", direction == "rtl" && "bg-base-100")}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M12 17.25h8.25" />
                        </svg>
                    </button>
                    <button onMouseDown={() => setDirection("ltr")} className={cx("btn btn-square btn-md", direction == "ltr" && "bg-base-100")}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
                        </svg>
                    </button>
                </div>

                <select
                    value={format}
                    onChange={(e) => {
                        setFormat(e.target.value as any);
                    }}
                    className="select select-bordered ml-auto">
                    <option value="normal">{t("mode-text")}</option>
                    <option value="srt">SRT</option>
                    <option value="vtt">VTT</option>
                </select>
            </div>
            <textarea
                placeholder={placeholder}
                readOnly={readonly}
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => setText(e.target.value)}
                value={text}
                dir={direction}
                className="textarea textarea-bordered w-full h-full text-lg rounded-tl-none rounded-tr-none focus:outline-none"
            />
        </div>
    );
}
