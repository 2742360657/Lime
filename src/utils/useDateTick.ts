import { useCallback, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

/** Refresh relative dates while visible and after returning from the background. */
export function useDateTick() {
  const [tick, setTick] = useState(Date.now());
  useFocusEffect(useCallback(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const resume = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
      if (AppState.currentState === 'active') {
        setTick(Date.now());
        timer = setInterval(() => setTick(Date.now()), 60_000);
      }
    };
    resume();
    const subscription = AppState.addEventListener('change', resume);
    return () => { if (timer) clearInterval(timer); subscription.remove(); };
  }, []));
  return tick;
}
