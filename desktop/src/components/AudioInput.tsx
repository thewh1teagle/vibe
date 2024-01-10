import { convertFileSrc } from '@tauri-apps/api/tauri';
import { useRef, useState } from 'react';
import { open } from '@tauri-apps/api/dialog';
import PlayIcon from '../icons/Play';
import PauseIcon from '../icons/Pause';

export default function AudioInput({
  onChange,
}: {
  onChange: (path: string) => void;
}) {
    const audioRef = useRef<HTMLAudioElement>()
    const [playing, setPlaying] = useState(false)
    const [name, setName] = useState<string | null>("");


  async function select() {
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: "Audio",
          extensions: ["mp3", "wav", "aac", "flac", "oga", "ogg", "opic"],
        },
      ],
    });
    if (selected)  {
        const resourcePath = convertFileSrc(selected as string);
        audioRef.current = new Audio(resourcePath as string);
        setName(selected as string);
        onChange(selected as string)
    }

  }

  function onEnd() {
    setPlaying(false)
  }

  function play() {
    audioRef?.current?.play()
    setPlaying(true)
    audioRef?.current?.addEventListener('ended', onEnd)
  }
  
  function pause() {
    audioRef?.current?.pause()
    setPlaying(false)
  }

  if (!name) {
    return (
        <div className='flex items-center w-full justify-center'>
            <button onClick={select} className="btn btn-primary w-full">Select Audio File</button>
        </div>
    )
  }

  return (
    <div className='flex-row  h-10 shadow-lg flex justify-between items-center bg-base-200 rounded-lg w-[100%] m-auto px-3 my-3'>
        <p>{name?.split('\\').pop()}</p>
        {playing && <PauseIcon onClick={pause} /> || <PlayIcon onClick={play} />}        
    </div>
  );
}
