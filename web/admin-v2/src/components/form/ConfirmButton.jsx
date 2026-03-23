import { useState, useRef, useEffect } from 'react';

export default function ConfirmButton({ children, onConfirm, className = 'btn btn-danger btn-sm', confirmText = 'Confirm?', timeout = 2000 }) {
  const [confirming, setConfirming] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const handleClick = () => {
    if (confirming) {
      clearTimeout(timer.current);
      setConfirming(false);
      onConfirm();
    } else {
      setConfirming(true);
      timer.current = setTimeout(() => setConfirming(false), timeout);
    }
  };

  return (
    <button className={className} onClick={handleClick}>
      {confirming ? confirmText : children}
    </button>
  );
}
