import { useState, useEffect } from 'react';

/**
 * Countdown hook that returns days/hours/minutes remaining until a target date.
 * @param {string|Date|null} endDate – ISO string or Date
 * @returns {{ days: number, hours: number, minutes: number, expired: boolean }}
 */
export default function useCountdown(endDate) {
  const [remaining, setRemaining] = useState(() => calc(endDate));

  useEffect(() => {
    if (!endDate) return;
    setRemaining(calc(endDate));
    const id = setInterval(() => setRemaining(calc(endDate)), 60_000);
    return () => clearInterval(id);
  }, [endDate]);

  return remaining;
}

function calc(endDate) {
  if (!endDate) return { days: 0, hours: 0, minutes: 0, expired: true };
  const diff = Math.max(0, new Date(endDate) - Date.now());
  if (diff === 0) return { days: 0, hours: 0, minutes: 0, expired: true };
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    expired: false,
  };
}
