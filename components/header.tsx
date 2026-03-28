import React from 'react'

const header = () => {
  return (
    <header className='flex justify-between items-center px-6 py-3 border-b bg-gray-900'>


      {/*left side */}
      <div className='flex items-center gap-3'>
        <div className='w-9 h-9 bg-blue-500'> Logo   </div>
       <div>
         <h1 className='text-lg font-bold text-white'>CodeArena</h1>
         <p className='text-xs text-gray-400'>Run Your code Smoothly</p>
       </div>
      </div>

     {/*now status i.e online or offline , Right Side */}
     <div className='flex items-center gap-2 text-sm text-gray-400'>
      <span></span>
      <span >Online</span>
     </div>
    </header>
  )
}

export default header