"use client"
import Image from "next/image";
import Header from "@/components/header";
import StdinInput from "@/components/stdinInput";
import CodeEditor from "@/components/CodeEditor";
export default function Home() {
  return (
    <div>
      <Header/>
      <StdinInput value="" onChange={(e)=>console.log(e)}/>
    </div>
    
    
    
    
  );
}
