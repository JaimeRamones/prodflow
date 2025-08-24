import React from 'react';

const ToggleSwitch = ({ checked, onChange }) => {
  return (
    <label className="group relative inline-block h-8 w-14 cursor-pointer rounded-full bg-gray-300 transition-colors [-webkit-tap-highlight-color:_transparent] has-[:checked]:bg-green-500">
      <input 
        type="checkbox" 
        checked={checked}
        onChange={onChange}
        className="peer sr-only" 
      />
      <span
        className="absolute inset-y-0 start-0 m-1 grid size-6 place-content-center rounded-full bg-white text-gray-700 transition-all duration-200 peer-checked:start-6"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          stroke="currentColor"
          className={`size-4 ${checked ? 'hidden' : 'block'}`}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          stroke="currentColor"
          className={`size-4 ${checked ? 'block' : 'hidden'}`}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      </span>
    </label>
  );
};

export default ToggleSwitch;


