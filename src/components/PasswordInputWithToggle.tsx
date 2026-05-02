"use client";

import { useState } from "react";

/** 相对初版 22px 为 2/3 */
const EYE_ICON_PX = (22 * 2) / 3;

function EyeOpenIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={EYE_ICON_PX} height={EYE_ICON_PX} aria-hidden>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth={2} />
    </svg>
  );
}

function EyeClosedIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={EYE_ICON_PX} height={EYE_ICON_PX} aria-hidden>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"
      />
      <path fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" d="M1 1l22 22" />
    </svg>
  );
}

export function PasswordInputWithToggle({
  id,
  autoComplete,
  value,
  onChange,
  required,
  minLength,
  disabled,
  placeholder,
}: {
  id: string;
  autoComplete: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  minLength?: number;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="input-password-wrap">
      <input
        id={id}
        className="input input--password-toggle"
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        disabled={disabled}
        placeholder={placeholder}
      />
      <button
        type="button"
        className="input-password-toggle"
        disabled={disabled}
        aria-label={show ? "隐藏密码" : "显示密码"}
        aria-pressed={show}
        onClick={() => setShow((s) => !s)}
      >
        {show ? <EyeOpenIcon /> : <EyeClosedIcon />}
      </button>
    </div>
  );
}
