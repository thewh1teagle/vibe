import { open } from "@tauri-apps/api/dialog";
import { convertFileSrc } from "@tauri-apps/api/tauri";
import formatDuration from "format-duration";
import { MutableRefObject, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import PauseIcon from "../icons/Pause";
import PlayIcon from "../icons/Play";
import { cx } from "../utils";

interface AudioInputProps {
  path?: string;
  setPath: React.Dispatch<React.SetStateAction<string | undefined>>;
  readonly?: boolean;
  audioRef: MutableRefObject<HTMLAudioElement | undefined>;
}

export default function AudioInput({ path, setPath, readonly, audioRef }: AudioInputProps) {
  const resourcePath = convertFileSrc(path as string);
  const [playing, setPlaying] = useState(false);
  const { t } = useTranslation();
  const [progress, setProgres] = useState(0);
  const [currentDuration, setCurrentDuration] = useState<number>(0);
  const [totalDuration, setTotalDuration] = useState<number>(0);

  function onLoadMetadata() {
    setTotalDuration(audioRef?.current?.duration ?? 0);
  }

  function onChangeDuration(e: React.MouseEvent<HTMLProgressElement>) {
    // Get the total width of the progress bar
    const progressBarWidth = e.currentTarget.clientWidth;

    // Calculate the clicked position as a percentage
    const clickPositionPercentage = ((i18n.dir() === "rtl" ? progressBarWidth - e.nativeEvent.offsetX : e.nativeEvent.offsetX) / progressBarWidth) * 100;

    // Calculate the new time based on the total duration and clicked position
    const newTime = (clickPositionPercentage / 100) * totalDuration;

    // Update the current time of the audio
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }

    // Update your state if needed
    setCurrentDuration(newTime);
  }

  useEffect(() => {
    audioRef.current?.pause();
    const newAudio = new Audio(resourcePath as string);
    audioRef.current = newAudio;
    newAudio.addEventListener("loadedmetadata", onLoadMetadata);

    return () => {
      audioRef.current?.pause();
      audioRef?.current?.removeEventListener("ended", onEnd);
      setPlaying(false);
    };
  }, []);

  async function select() {
    audioRef.current?.pause();
    setPlaying(false);
    const videoExtensions = ["mp4", "mkv", "avi", "mov", "wmv", "webm"];
    const audioExtensions = ["mp3", "wav", "aac", "flac", "oga", "ogg", "opic"];
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: "Audio",
          extensions: [...audioExtensions, ...videoExtensions],
        },
      ],
    });
    if (selected) {
      setPath(selected as string);
      audioRef.current?.pause();
      const newAudio = new Audio(convertFileSrc(selected as string));
      newAudio.addEventListener("loadedmetadata", onLoadMetadata);
      audioRef.current = newAudio;
    }
  }

  function onEnd() {
    setPlaying(false);
    audioRef.current?.pause();
  }

  function onTimeUpdate(event: any) {
    const position = audioRef.current?.currentTime ?? 1;
    const total = audioRef.current?.duration ?? 1;
    const newProgress = (position / total) * 100;
    setProgres(newProgress);

    setCurrentDuration(position);
    setTotalDuration(total);
  }

  function play() {
    audioRef.current?.play();
    setPlaying(true);
    audioRef.current?.addEventListener("timeupdate", onTimeUpdate);
    audioRef.current?.addEventListener("ended", onEnd);
  }

  function pause() {
    setPlaying(false);
    audioRef.current?.pause();
  }

  if (!path) {
    return (
      <div className="flex items-center w-full justify-center">
        <button onClick={select} className="btn btn-primary w-full">
          {t("select-audio-file")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full">
      <div className="flex-col cursor-pointer shadow-lg flex justify-between px-3 py-2 bg-base-200 relative rounded-lg  w-[100%] m-auto mt-3 select-none">
        <p className="overflow-hidden">{path?.split("\\").pop()}</p>
        <div className="flex flex-col mt-3 w-[90%] m-auto ">
          <progress
            onClick={onChangeDuration}
            className="progress w-full h-[5px] bg-base-100 hover:h-[12px] transition-height duration-100 ease-in-out progress-primary rounded-3xl"
            value={progress}
            max="100"></progress>
          <div className="w-full flex flex-row justify-between text-sm mt-1">
            <div>{formatDuration(currentDuration * 1000)}</div>
            <div>{formatDuration(totalDuration === 0 ? 0 : totalDuration * 1000)}</div>
          </div>
        </div>
        <label className={cx("swap text-1xl absolute bottom-1 left-1/2 -translate-x-1/2", playing && "swap-active")}>
          <div className="swap-off">
            <PlayIcon onClick={() => (playing ? pause() : play())} />
          </div>
          <div className="swap-on">
            <PauseIcon onClick={() => (playing ? pause() : play())} />
          </div>
        </label>
      </div>

      {!readonly && (
        <div onClick={select} className={cx("text-xs text-base-content font-medium cursor-pointer mb-3 mt-1")}>
          {t("change-file")}
        </div>
      )}
    </div>
  );
}
