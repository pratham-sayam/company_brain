import { useEffect, useRef, useCallback } from 'react';
import styles from './ContextMenu.module.css';

/**
 * Reusable context menu component.
 *
 * Props:
 *   x, y       — cursor position (numbers)
 *   items      — array of menu item descriptors:
 *                { type: 'action', label, icon?, shortcut?, danger?, onClick }
 *                { type: 'separator' }
 *                { type: 'label', text }
 *   onClose    — called when the menu should close
 */
function ContextMenu({ x, y, items, onClose }) {
  const menuRef = useRef(null);

  // ── Clamp position so menu stays in viewport ──
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let adjustedX = x;
    let adjustedY = y;

    if (x + rect.width > vw - 8) adjustedX = vw - rect.width - 8;
    if (y + rect.height > vh - 8) adjustedY = vh - rect.height - 8;
    if (adjustedX < 8) adjustedX = 8;
    if (adjustedY < 8) adjustedY = 8;

    el.style.left = `${adjustedX}px`;
    el.style.top = `${adjustedY}px`;
  }, [x, y]);

  // ── Escape key closes ──
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);

  function handleAction(item) {
    onClose();
    if (item.onClick) item.onClick();
  }

  return (
    <>
      <div className={styles.backdrop} onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div ref={menuRef} className={styles.menu} style={{ left: x, top: y }}>
        {items.map((item, i) => {
          if (item.type === 'separator') {
            return <div key={`sep-${i}`} className={styles.separator} />;
          }

          if (item.type === 'label') {
            return <div key={`lbl-${i}`} className={styles.label}>{item.text}</div>;
          }

          return (
            <button
              key={item.label || i}
              className={`${styles.item} ${item.danger ? styles.itemDanger : ''} ${item.disabled ? styles.itemDisabled : ''}`}
              onClick={() => !item.disabled && handleAction(item)}
              disabled={item.disabled}
              title={item.disabled ? item.disabledTooltip : undefined}
              type="button"
            >
              {item.icon && <span className={styles.itemIcon}>{item.icon}</span>}
              {item.label}
              {item.shortcut && <span className={styles.shortcut}>{item.shortcut}</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}

export default ContextMenu;
