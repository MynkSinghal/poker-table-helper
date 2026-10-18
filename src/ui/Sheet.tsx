import { AnimatePresence, motion, useDragControls } from 'motion/react';
import type { ReactNode } from 'react';

export function Sheet({ open, onClose, children, dismissable = true }: { open: boolean; onClose?: () => void; children: ReactNode; dismissable?: boolean }) {
  const controls = useDragControls();
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="veil" className="veil" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={dismissable ? onClose : undefined} />
          <motion.div
            key="sheet" className="sheet" role="dialog" aria-modal="true"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 34, stiffness: 420 }}
            drag={dismissable ? 'y' : false} dragListener={false} dragControls={controls}
            dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.7 }}
            onDragEnd={(_, info) => { if (info.offset.y > 110 || info.velocity.y > 600) onClose?.(); }}
          >
            <div className="grab" onPointerDown={e => dismissable && controls.start(e)} style={{ touchAction: 'none', padding: '6px 0', margin: '-6px auto 8px' }} />
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
