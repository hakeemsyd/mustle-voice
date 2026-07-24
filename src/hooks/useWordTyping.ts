import { useEffect, useState } from "react";

const WORD_SPEED = 90;

export const useWordTyping = (
  text: string,
  active: boolean,
  speed: number = WORD_SPEED,
) => {
  const words = text.split(" ");
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!active) {
      setCount(0);
      return;
    }

    setCount(0);

    let i = 0;

    const id = setInterval(() => {
      i += 1;
      setCount(i);

      if (i >= words.length) {
        clearInterval(id);
      }
    }, speed);

    return () => clearInterval(id);
  }, [text, active, speed]);

  return {
    count,
    isDone: count >= words.length,
    words,
  };
};