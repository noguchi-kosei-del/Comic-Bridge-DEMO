import { useState, useCallback, useEffect } from "react";

const EXIT_DURATION_MS = 220;

/**
 * ダイアログの閉じるアニメーションを管理するフック
 *
 * 使い方:
 * ```tsx
 * const { isExiting, animationClass, requestClose } = useDialogClose(onClose);
 * // 背景や閉じるボタンの onClick に requestClose を渡す
 * <div className={`... ${animationClass}`}>...</div>
 * ```
 *
 * requestClose() が呼ばれると isExiting が true になりアニメ完了後に onClose が呼ばれる。
 */
export function useDialogClose(onClose: () => void, durationMs: number = EXIT_DURATION_MS) {
  const [isExiting, setIsExiting] = useState(false);

  // アンマウント時のタイマークリア
  useEffect(() => {
    return () => {
      setIsExiting(false);
    };
  }, []);

  const requestClose = useCallback(() => {
    if (isExiting) return;
    setIsExiting(true);
    window.setTimeout(() => {
      onClose();
    }, durationMs);
  }, [onClose, isExiting, durationMs]);

  const animationClass = isExiting ? "animate-dialog-pop-out" : "animate-dialog-pop";
  const backdropClass = isExiting ? "animate-backdrop-out" : "animate-backdrop-in";

  return { isExiting, animationClass, backdropClass, requestClose };
}
