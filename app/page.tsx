import Image from "next/image";
import Header from "@/components/header";
import StdinInput from "@/components/stdinInput";

export default function Home() {
  return (
    <div>
      <Header/>
      <StdinInput value="" onchange={(e)=>console.log(e)}/>
    </div>
    
    
    
    
  );
}
