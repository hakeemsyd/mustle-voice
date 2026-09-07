import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

/** True while the software keyboard is on screen. Used to hide chrome that would otherwise sit
 *  between the message being replied to and the composer — suggestion chips, mainly. */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // The `will` events fire alongside the keyboard's own animation, so anything keyed off this
    // moves with it rather than snapping into place a frame late.
    const show = Keyboard.addListener('keyboardWillShow', () => setOpen(true));
    const hide = Keyboard.addListener('keyboardWillHide', () => setOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return open;
}
