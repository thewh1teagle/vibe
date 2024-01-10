import { useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import "./App.css";
import ThemeToggle from "./components/ThemeToggle";
import { open, save } from '@tauri-apps/api/dialog';
import LanguageInput from "./components/LanguageINput";
import { fs } from "@tauri-apps/api";


function App() {
  const [name, setName] = useState<string | string[] | null>("");
  const [loading, setLoading] = useState(false)
  const [text, setText] = useState('')
  const [lang, setLang] = useState('')

  async function select() {
    const selected = await open({
      multiple: true,
      filters: [{
        name: 'Audio',
        extensions: ['mp3', 'wav', "aac", "flac", "oga", "ogg", "opic"]
      }]
    });
    setName(selected?.[0] ?? null)
  }

  async function transcribe() {
    setLoading(true)
    try {
      console.log('name => ', name)
      const res: any = await invoke("transcribe", {path: name as string, lang})
      console.log('res => ', res)
      setLoading(false)
      setText(res?.text as string)
    } catch (e) {
      setLoading(false)
      console.error('error: ', e)
    }
    
  }


  if (loading) {
    return (
      <div className="w-[100vw] h-[100vh] flex flex-col justify-center items-center">
        <div className="text-3xl m-5 font-bold">Transcribing...</div>
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    )
  }

  async function download() {
    const filePath = await save({
      filters: [{
        name: 'Text',
        extensions: ['txt']
      }]
    });
    if (filePath) {
      fs.writeTextFile(filePath, text)
    }
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col m-auto w-[300px] mt-10">
      <h1 className="text-center text-4xl mb-10">Vibe!</h1>
      <div className="absolute right-16 top-16">
      <ThemeToggle />
      </div>
      <LanguageInput onChange={lang => setLang(lang)} />
      {!name && <button onClick={select} className="btn btn-primary">Select Audio File</button>}
      {name && (
        <p>{name}</p>
      )}
      {name && (
        <button onClick={transcribe} className="btn btn-primary">Transcribe</button>
      )}
      </div>
      {text && (
        <div className="flex flex-col mt-20 items-center w-[60%] m-auto">
          <div className="w-full flex gap-3">
            <button onClick={() => navigator.clipboard.writeText(text)} className="btn btn-primary">Copy</button>
            <button onClick={download} className="btn btn-primary">Download</button>
          </div>
          <textarea className="textarea textarea-bordered textarea-primary h-[50vh] w-full mt-2" defaultValue={text} />
        </div>
      )}
    </div>
  );
}

export default App;
