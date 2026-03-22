//Monaco editor here 
import React from 'react'
import Editor from "@monaco-editor/react"


interface CodeEditorProps{
    code:string,
    language:string,
    onchange:(code:string)=>void,
}

const CodeEditor = ({language,code,onchange}:CodeEditorProps) => {

    const languageSupported: {[key: string]: string} = {"cpp":"cpp","c":"c","python":"python"}

  return (
    <Editor
     height="100%"
     language={languageSupported[language] || language}
     value={code}
     onChange={(code: string | undefined)=>onchange(code || "")}
     theme='vs-dark'
     options={{
        minimap:{enabled:false},
        fontSize:14,
        fontFamily:"JetBrains Mono, monospace",
        scrollBeyondLastLine: false,
        padding:{top:16}
     }}
    />
  )
}

export default CodeEditor