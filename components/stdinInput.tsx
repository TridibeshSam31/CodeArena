import {Textarea} from "./ui/textarea";


interface stdinputProps{
    value:string;
    onchange:(e:React.ChangeEvent<HTMLTextAreaElement>)=>void;
}

export default function StdinInput({value,onchange}:stdinputProps) {
    //ek box bnana hai jisme likha hoga Enter Input for code aur usko align krna hai yaa toh neeche ya fir right side me above output code box
    return (
        <div className="border-t border-indigo-500/10">
            <Textarea value={value}
            onChange={(e) => onchange(e)}
            placeholder="Enter Input for code"
            spellCheck={false}
            className="w-full px-4 py-2 bg-dark-500 text-white font-mono text-xl border-none outline-none resize-none focus-visible:ring-offset-0 placeholder:text-slate-600 h-24 rounded-none"
            />
        </div>

    )
}