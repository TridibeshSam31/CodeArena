"use client"

import React from "react";

interface StdInputProps{
    stdin:String;
    onchange:(stdin:String) => void;
}



const StdinInput = ({stdin,onchange}:StdInputProps) => {
    return(
        <div className="arena-sub-panel arena-stdin-panel">
        <div className="arena-panel-header">
            <div className="arena-panel-dots">
                <span /><span /><span />

            </div>
            <span className="arena-panel-title">stdin</span>
            <span className="arena-panel-badge">input</span>

        </div>
        <textarea
        className="arena-stdin"
        //@ts-ignore
        value={stdin}
        onChange={(e) => onchange(e.target.value)}
        placeholder="Enter input for your program..."
        spellCheck={false}
        />

        </div>
    )
}


export default StdinInput;