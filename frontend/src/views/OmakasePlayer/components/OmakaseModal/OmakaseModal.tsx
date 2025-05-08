import React, { ReactElement, ReactNode, useState } from "react";
import { createPortal } from "react-dom";
import "./OmakaseModal.css";

interface ModalContentProps {
  onClose: () => void;
  header?: ReactNode;
  children: ReactNode;
}

function ModalContent({ onClose, header, children }: ModalContentProps) {
  const headerClassName = header
    ? "modal-header"
    : "modal-header modal-header-only-close";
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className={headerClassName}>
          {header && <div className="modal-title">{header}</div>}
          <button onClick={onClose} className="modal-close">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

interface OmakaseModalProps {
  trigger: ReactNode;
  header?: ReactNode;
  children: ReactElement<{
    setShowModal: React.Dispatch<React.SetStateAction<boolean>>;
  }>;
}

export default function OmakaseModal({
  trigger,
  header,
  children,
}: OmakaseModalProps) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div onClick={() => setShowModal(true)}>{trigger}</div>

      {showModal &&
        createPortal(
          <ModalContent onClose={() => setShowModal(false)} header={header}>
            {React.cloneElement(children, { setShowModal })}
          </ModalContent>,
          document.body
        )}
    </>
  );
}
