import React from 'react'


interface stdinputProps{
    result:string;
    polling:boolean;
    error:any
}


const outputPanal = ({result,polling,error}:stdinputProps) => {
  return (
    <div>outputPanal</div>
  )
}

export default outputPanal