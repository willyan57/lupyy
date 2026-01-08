import { useEffect, useState } from "react";
import { Platform, useWindowDimensions } from "react-native";

export function useIsMobileWeb(breakpoint = 900) {
  const { width } = useWindowDimensions();
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web") return;

    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(!!mq.matches);

    update();

    if (mq.addEventListener) mq.addEventListener("change", update);
    else mq.addListener(update);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", update);
      else mq.removeListener(update);
    };
  }, []);

  if (Platform.OS !== "web") return false;

  return width < breakpoint || coarse;
}
