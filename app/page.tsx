"use client"

import React,{useState,useCallback,useEffect,useRef} from "react";
import OutputPanel from "@/components/outputPanal";
import CodeEditor from "@/components/CodeEditor";
import StdinInput from "@/components/stdinInput";
import Header from "@/components/Header";

const LANGUAGES = [
  {id: "cpp",label: "C++", icon:"⚡" },
  {id: "python",label: "Python", icon:"🐍" },
  {id: "c",label: "C", icon:"💻" }
]


const DEFAULT_CODE: Record<string,string> = {
   cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    
    // Your code here
    cout << "Hello, World!" << endl;
    
    return 0;
}`,
  c: `#include <stdio.h>
#include <stdlib.h>

int main() {
    // Your code here
    printf("Hello, World!\\n");
    
    return 0;
}`,
  python: `import sys
input = sys.stdin.readline

def main():
    # Your code here
    print("Hello, World!")

if __name__ == "__main__":
    main()`,

}

type SubmissionStatus = "idle" | "pending" | "running" | "completed" | "error";


export default function Home() {
  const [language,setLanguage] = useState("cpp")
  const[code,setCode] = useState(DEFAULT_CODE["cpp"])
  const[stdin,setStdin] = useState("")
  const[output,setOutput] = useState("")
  const[stderr,setStderr] = useState("")
  const [execTime,setExecTime] = useState<number | null>(null)
  const [langDropOpen, setLangDropOpen] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const [status, setStatus] = useState<SubmissionStatus>("idle");
  
   const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);



   
  const handleLanguageChange = (Lang:string)=>{
    setLanguage(Lang)
    setCode(DEFAULT_CODE[Lang])
    setLangDropOpen(false)
  }

  const handleSubmit = async () =>{
    if(status === "running" || status === "pending") {
      return;
    }

    setStatus("pending");
    setOutput("");
    setStderr("");
    setExecTime(null);
    startTimeRef.current = Date.now();



    try {
      const res = await fetch("/api/submit",{
        method:"post",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify({code,language, stdin: stdin ?? " "})
      })

      if(!res.ok){
        const error = await res.json()
        setStatus("error")
        setStderr(error.message || "Submission failed");
      }


      const { submissionId } = await res.json();

      pollingRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/submission/${submissionId}`);
          const data = await pollRes.json();

          if (data.status === "running") {
            setStatus("running");
          }

          if (data.status === "completed" || data.status === "error") {
            stopPolling();
            setStatus(data.status);
            setOutput(data.output || "");
            setStderr(data.stderr || "");
            setExecTime(Date.now() - startTimeRef.current);
          }
        } catch {
          stopPolling();
          setStatus("error");
          setStderr("Network error while polling");
        }
      }, 1200);

      
    } catch (error) {
      setStatus("error")
      setStderr("Failed to submit code , pls try again");
    }
  }
  

  const isRunning = status === "pending" || status === "running";
  const currentLang = LANGUAGES.find((l) => l.id === language)!;



   return (
    <div className="arena-root">
      {/* Top Bar */}
      <Header status={status} execTime={execTime} />

      {/* Main Layout */}
      <main className="arena-main">
        {/* Editor Panel */}
        <section className="arena-editor-panel">
          <div className="arena-panel-header">
            <div className="arena-panel-dots">
              <span /><span /><span />
            </div>
            <span className="arena-panel-title">editor</span>
            <div className="arena-lang-selector" onClick={() => setLangDropOpen(!langDropOpen)}>
              <span className="arena-lang-icon">{currentLang.icon}</span>
              <span className="arena-lang-label">{currentLang.label}</span>
              <span className="arena-lang-chevron">{langDropOpen ? "▲" : "▼"}</span>
              {langDropOpen && (
                <div className="arena-lang-dropdown">
                  {LANGUAGES.map((l) => (
                    <button
                      key={l.id}
                      className={`arena-lang-option ${l.id === language ? "active" : ""}`}
                      onClick={(e) => { e.stopPropagation(); handleLanguageChange(l.id); }}
                    >
                      <span>{l.icon}</span>
                      <span>{l.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="arena-editor-wrap">
            <CodeEditor
              language={language}
              code={code}
              onchange={setCode}
            />
          </div>
          <div className="arena-editor-footer">
            <span className="arena-line-count">
              {code.split("\n").length} lines · {code.length} chars
            </span>
            <button
              className={`arena-run-btn ${isRunning ? "running" : ""}`}
              onClick={handleSubmit}
              disabled={isRunning}
            >
              {isRunning ? (
                <>
                  <span className="arena-spinner" />
                  {status === "pending" ? "Queuing..." : "Running..."}
                </>
              ) : (
                <>
                  <span className="arena-run-icon">▶</span>
                  Run Code
                </>
              )}
            </button>
          </div>
        </section>

        {/* Right Panel */}
        <aside className="arena-right-panel">
          {/* Stdin */}
          <StdinInput value={stdin} onChange={setStdin} />

          {/* Output */}
          <OutputPanel status={status} output={output} stderr={stderr} />
        </aside>
      </main>
    </div>
  );


}