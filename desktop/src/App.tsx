import { useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import "./App.css";
import ThemeToggle from "./components/ThemeToggle";
import { save } from '@tauri-apps/api/dialog';
import { fs } from "@tauri-apps/api";
import LanguageInput from "./components/LanguageInput";
import AudioInput from "./components/AudioInput";
import {message as dialogMessage} from '@tauri-apps/api/dialog';
import {appWindow} from '@tauri-apps/api/window';
import successSound from './assets/success.wav'

function App() {

  const [path, setPath] = useState('')
  const [loading, setLoading] = useState(false)
  const [text, setText] = useState('')
  const [lang, setLang] = useState('')



  async function transcribe() {
    setLoading(true)
    try {
      const res: any = await invoke("transcribe", {path, lang})
      setLoading(false)
      new Audio(successSound).play()
      setText(res?.text as string)
      setPath('')
    } catch (e: any) {
      console.error('error: ', e)
      await dialogMessage(e?.toString(), { title: 'Error', type: 'error' });
      setLoading(false)
      setPath('')
    } finally {
      appWindow.unminimize()
      appWindow.setFocus()      
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
      <AudioInput onChange={newPath => setPath(newPath)} />
      {path && (
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
